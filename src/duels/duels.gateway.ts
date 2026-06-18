import { BadRequestException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DuelsService, QuestionSummaryItem } from './duels.service';
import { DuelEvents } from './types/duel-events';
import { DuelStatus } from './types/duel-status.enum';
import { DuelMode } from './types/duel-mode.enum';
import { Duel } from './entities/duel.entity';
import type { JwtPayload } from '../common/types/jwt-payload.type';

const BLITZ_TIMEOUT_MS = 5000;
const STEAL_TIMEOUT_MS = 5000;
const FORFEIT_TIMEOUT_SECONDS = 60;
const EARLY_DISCONNECT_GRACE_MS = 30_000;

@WebSocketGateway({ namespace: '/duels', cors: { origin: '*' } })
export class DuelsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DuelsGateway.name);

  // duelId → Set of connected userIds
  private readonly connectedPlayers = new Map<string, Set<string>>();
  // duelId → Set of userIds who have ever successfully joined (used to gate forfeit timers)
  private readonly everConnected = new Map<string, Set<string>>();
  // duelId → forfeit countdown timer
  private readonly forfeitTimers = new Map<string, NodeJS.Timeout>();
  // duelId → steal window timer
  private readonly stealTimers = new Map<string, NodeJS.Timeout>();
  // `${duelId}:${userId}` → blitz per-player question timer
  private readonly blitzTimers = new Map<string, NodeJS.Timeout>();
  // userId → socketId — maintained on connect/disconnect for O(1) per-player lookup
  private readonly userSocketMap = new Map<string, string>();

  constructor(
    private readonly duelsService: DuelsService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(): void {
    this.logger.log('DuelsGateway initialized');
  }

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth as Record<string, string>).token ||
      (client.handshake.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      client.data.userId = payload.sub;
      this.userSocketMap.set(payload.sub, client.id);
      this.logger.log(`WS connected: ${client.id} userId=${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = client.data.userId as string | undefined;

    if (!userId) return;

    // Only remove if this socket is still the current one for this user.
    // Guards against a reconnect arriving before the old socket's disconnect fires.
    if (this.userSocketMap.get(userId) === client.id) {
      this.userSocketMap.delete(userId);
    }

    for (const [duelId, players] of this.connectedPlayers.entries()) {
      if (!players.has(userId)) continue;

      players.delete(userId);

      try {
        const duel = await this.duelsService.getDuelById(duelId);
        const hadFullyJoined = this.everConnected.get(duelId)?.has(userId) ?? false;

        const isPlayable =
          duel &&
          (duel.status === DuelStatus.ACTIVE || duel.status === DuelStatus.SUDDEN_DEATH) &&
          hadFullyJoined;

        if (isPlayable) {
          const earlyDisconnect =
            duel.startedAt != null &&
            Date.now() - duel.startedAt.getTime() <= EARLY_DISCONNECT_GRACE_MS;

          if (earlyDisconnect) {
            // Duel just started — cancel and refund both players rather than forfeiting
            await this.duelsService.cancelAndRefund(duelId);
            this.server.to(`duel:${duelId}`).emit(DuelEvents.DUEL_FORFEITED, {
              forfeitedBy: userId,
              winnerId: null,
              reason: 'early_disconnect',
            });
            this.clearAllTimers(duelId);
          } else {
            this.server.to(`duel:${duelId}`).emit(DuelEvents.OPPONENT_DISCONNECTED, {
              forfeitTimeoutSeconds: FORFEIT_TIMEOUT_SECONDS,
            });

            const config = await this.duelsService['duelConfigService'].getConfig();
            const timeoutMs = (config?.forfeitTimeoutSeconds ?? FORFEIT_TIMEOUT_SECONDS) * 1000;

            const timer = setTimeout(() => {
              void this.duelsService.forfeit(duelId, userId);
            }, timeoutMs);

            this.forfeitTimers.set(duelId, timer);
          }
        } else {
          this.server.to(`duel:${duelId}`).emit(DuelEvents.OPPONENT_DISCONNECTED, {
            forfeitTimeoutSeconds: null,
          });
        }
      } catch (err) {
        this.logger.error(`handleDisconnect error for duel ${duelId}`, err);
      }
    }

    this.logger.log(`WS disconnected: ${client.id} userId=${userId}`);
  }

  @SubscribeMessage(DuelEvents.JOIN_DUEL)
  async handleJoinDuel(
    client: Socket,
    payload: { duelId: string },
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;

    if (!userId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    // Cancel any pending forfeit timer immediately on reconnect, before any DB work
    const pendingForfeit = this.forfeitTimers.get(payload.duelId);
    if (pendingForfeit) {
      clearTimeout(pendingForfeit);
      this.forfeitTimers.delete(payload.duelId);
    }

    try {
      const duel = await this.duelsService.getDuelById(payload.duelId);

      if (!duel || (duel.challengerId !== userId && duel.opponentId !== userId)) {
        client.emit('error', { message: 'Duel not found or not a participant' });
        return;
      }

      const room = `duel:${duel.id}`;
      await client.join(room);

      // Track current connection
      if (!this.connectedPlayers.has(duel.id)) {
        this.connectedPlayers.set(duel.id, new Set());
      }
      this.connectedPlayers.get(duel.id)!.add(userId);

      // Mark this player as having fully connected at least once (gates forfeit timer)
      if (!this.everConnected.has(duel.id)) {
        this.everConnected.set(duel.id, new Set());
      }
      this.everConnected.get(duel.id)!.add(userId);

      client.emit('joined', { duelId: duel.id });

      if (duel.status === DuelStatus.ACTIVE || duel.status === DuelStatus.SUDDEN_DEATH) {
        const otherPlayerId =
          userId === duel.challengerId ? duel.opponentId : duel.challengerId;
        const otherInRoom =
          otherPlayerId != null &&
          (this.connectedPlayers.get(duel.id)?.has(otherPlayerId) ?? false);

        if (otherInRoom) {
          // Both players now in the room — full room sync so nobody is stale
          await this.emitQuestionReady(duel);
        } else {
          // Only this player is here — send question only to them so the other's timer is untouched
          await this.emitQuestionReadyToSocket(client, duel);
        }
      }
    } catch (err) {
      this.logger.error('handleJoinDuel error', err);
      client.emit('error', { message: 'Internal error' });
    }
  }

  @SubscribeMessage(DuelEvents.SUBMIT_ANSWER)
  async handleSubmitAnswer(
    client: Socket,
    payload: {
      duelId: string;
      questionId: string;
      selectedAnswer: number;
      timeTakenMs: number;
    },
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;

    if (!userId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    try {
      const duel = await this.duelsService.getDuelById(payload.duelId);

      if (
        !duel ||
        (duel.challengerId !== userId && duel.opponentId !== userId)
      ) {
        client.emit('error', { message: 'Duel not found or not a participant' });
        return;
      }

      // Clear blitz timer for this player
      const blitzKey = `${duel.id}:${userId}`;
      const blitzTimer = this.blitzTimers.get(blitzKey);
      if (blitzTimer) {
        clearTimeout(blitzTimer);
        this.blitzTimers.delete(blitzKey);
      }

      let result: Awaited<ReturnType<typeof this.duelsService.processAnswer>>;

      try {
        result = await this.duelsService.processAnswer(
          duel,
          userId,
          payload.selectedAnswer,
          payload.timeTakenMs,
        );
      } catch (err) {
        if (
          err instanceof BadRequestException &&
          err.message === 'Already answered this question'
        ) {
          return; // silent ignore — answer already recorded, game state is correct
        }
        throw err;
      }

      const room = `duel:${duel.id}`;

      // Send result to answering player only
      client.emit(DuelEvents.ANSWER_RESULT, {
        isCorrect: result.isCorrect,
        correctAnswer: result.isCorrect ? payload.selectedAnswer : undefined,
        pointsEarned: result.scoreAdded,
        yourScore:
          userId === result.updatedDuel.challengerId
            ? result.updatedDuel.challengerScore
            : result.updatedDuel.opponentScore,
        challengerScore: result.updatedDuel.challengerScore,
        opponentScore: result.updatedDuel.opponentScore,
        yourStreak:
          result.updatedDuel.mode === DuelMode.STREAK
            ? userId === result.updatedDuel.challengerId
              ? result.updatedDuel.challengerStreak
              : result.updatedDuel.opponentStreak
            : undefined,
        stealOpportunity: result.stealOpportunity,
      });

      // Broadcast to room excluding the submitting socket
      client.to(room).emit(DuelEvents.OPPONENT_ANSWERED, {
        userId,
        isCorrect: result.isCorrect,
        challengerScore: result.updatedDuel.challengerScore,
        opponentScore: result.updatedDuel.opponentScore,
        opponentStreak:
          result.updatedDuel.mode === DuelMode.STREAK
            ? userId === result.updatedDuel.challengerId
              ? result.updatedDuel.challengerStreak
              : result.updatedDuel.opponentStreak
            : undefined,
        stealOpportunity: result.stealOpportunity,
        stealTimeoutSeconds: result.stealOpportunity ? STEAL_TIMEOUT_MS / 1000 : undefined,
      });

      // Handle steal opportunity
      if (result.stealOpportunity && result.updatedDuel.stealOpportunityUserId) {
        const opponentId = result.updatedDuel.stealOpportunityUserId;

        this.stealTimers.set(
          duel.id,
          setTimeout(() => {
            void this.handleStealTimeout(duel.id);
          }, STEAL_TIMEOUT_MS),
        );

        // Emit steal opportunity to opponent socket directly
        const opponentSocket = this.findSocketByUserId(opponentId);

        if (opponentSocket && result.updatedDuel.stealQuestionId) {
          const stealQuestion = await this.duelsService.getCurrentQuestion({
            ...result.updatedDuel,
            currentQuestionIndex: result.updatedDuel.questionIds.indexOf(
              result.updatedDuel.stealQuestionId,
            ),
          });

          opponentSocket.emit(DuelEvents.STEAL_OPPORTUNITY, {
            questionId: result.updatedDuel.stealQuestionId,
            question: stealQuestion,
            timeoutSeconds: STEAL_TIMEOUT_MS / 1000,
          });
        }
      }

      // Resolve steal result
      if (result.stealResult) {
        const stealTimer = this.stealTimers.get(duel.id);
        if (stealTimer) {
          clearTimeout(stealTimer);
          this.stealTimers.delete(duel.id);
        }

        this.server.to(room).emit(DuelEvents.STEAL_RESULT, {
          stealSuccess: result.stealResult.success,
          stealerId: userId,
          newScores: {
            challengerScore: result.updatedDuel.challengerScore,
            opponentScore: result.updatedDuel.opponentScore,
          },
        });
      }

      // Advance game state
      if (result.nextQuestionReady || result.suddenDeathStarted) {
        await this.emitQuestionReady(result.updatedDuel);
      }

      if (result.duelComplete) {
        this.clearAllTimers(duel.id);

        this.emitDuelCompletePerPlayer(result.updatedDuel, {
          winnerId: result.updatedDuel.winnerId,
          isTie: result.updatedDuel.isTie,
          challengerScore: result.updatedDuel.challengerScore,
          opponentScore: result.updatedDuel.opponentScore,
          challengerMaxStreak: result.updatedDuel.challengerMaxStreak,
          opponentMaxStreak: result.updatedDuel.opponentMaxStreak,
          prizeWon: result.updatedDuel.stake,
          suddenDeathRounds: result.updatedDuel.suddenDeathRound,
        });
      }
    } catch (err) {
      this.logger.error('handleSubmitAnswer error', err);
      client.emit('error', { message: (err as Error).message ?? 'Internal error' });
    }
  }

  @SubscribeMessage(DuelEvents.FORFEIT)
  async handleForfeit(client: Socket, payload: { duelId: string }): Promise<void> {
    const userId = client.data.userId as string | undefined;

    if (!userId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    try {
      this.clearAllTimers(payload.duelId);
      await this.duelsService.forfeit(payload.duelId, userId);
    } catch (err) {
      this.logger.error('handleForfeit error', err);
      client.emit('error', { message: 'Internal error' });
    }
  }

  // ─── NestJS event listeners (service → gateway) ─────────────────────────────

  @OnEvent('duel.accepted')
  async handleDuelAccepted({ duelId }: { duelId: string }): Promise<void> {
    try {
      const duel = await this.duelsService.getDuelById(duelId);

      if (!duel) return;

      const room = `duel:${duelId}`;

      this.server.to(room).emit(DuelEvents.DUEL_READY, {
        duelId: duel.id,
        mode: duel.mode,
        arena: duel.arena,
        totalQuestions: duel.questionIds.length,
      });

      // If both already connected, start immediately
      const connected = this.connectedPlayers.get(duelId);
      const bothConnected =
        connected?.has(duel.challengerId) && connected?.has(duel.opponentId ?? '');

      if (bothConnected) {
        await this.emitQuestionReady(duel);
      }
    } catch (err) {
      this.logger.error('handleDuelAccepted error', err);
    }
  }

  @OnEvent('duel.forfeited')
  handleDuelForfeited({
    duelId,
    winnerId,
    forfeitingUserId,
  }: {
    duelId: string;
    winnerId: string;
    forfeitingUserId: string;
  }): void {
    this.server.to(`duel:${duelId}`).emit(DuelEvents.DUEL_FORFEITED, {
      forfeitedBy: forfeitingUserId,
      winnerId,
    });

    this.clearAllTimers(duelId);
  }

  @OnEvent('duel.completed')
  handleDuelCompleted({
    duel,
    questionSummary,
    challengerCorrect,
    opponentCorrect,
  }: {
    duel: Duel;
    questionSummary: QuestionSummaryItem[];
    challengerCorrect: number;
    opponentCorrect: number;
  }): void {
    this.emitDuelCompletePerPlayer(duel, {
      ...duel,
      questionSummary,
      challengerCorrect,
      opponentCorrect,
    });

    this.clearAllTimers(duel.id);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async emitQuestionReady(duel: Duel): Promise<void> {
    try {
      const freshDuel = await this.duelsService.getDuelById(duel.id);

      if (!freshDuel) return;

      const question = await this.duelsService.getCurrentQuestion(freshDuel);

      const timeoutSeconds =
        freshDuel.mode === DuelMode.BLITZ
          ? 5
          : freshDuel.mode === DuelMode.SUDDEN_DEATH
            ? null
            : 10;

      this.server.to(`duel:${freshDuel.id}`).emit(DuelEvents.QUESTION_READY, {
        questionIndex: freshDuel.currentQuestionIndex,
        totalQuestions: freshDuel.questionIds.length,
        question,
        timeoutSeconds,
        challengerScore: freshDuel.challengerScore,
        opponentScore: freshDuel.opponentScore,
        challengerStreak: freshDuel.challengerStreak,
        opponentStreak: freshDuel.opponentStreak,
      });

      // Start per-player timers for Blitz mode
      if (freshDuel.mode === DuelMode.BLITZ) {
        for (const playerId of [freshDuel.challengerId, freshDuel.opponentId].filter(
          Boolean,
        ) as string[]) {
          this.startBlitzTimer(freshDuel, playerId);
        }
      }
    } catch (err) {
      this.logger.error('emitQuestionReady error', err);
    }
  }

  private async emitQuestionReadyToSocket(client: Socket, duel: Duel): Promise<void> {
    try {
      const freshDuel = await this.duelsService.getDuelById(duel.id);

      if (!freshDuel) return;

      const question = await this.duelsService.getCurrentQuestion(freshDuel);

      const timeoutSeconds =
        freshDuel.mode === DuelMode.BLITZ
          ? 5
          : freshDuel.mode === DuelMode.SUDDEN_DEATH
            ? null
            : 10;

      client.emit(DuelEvents.QUESTION_READY, {
        questionIndex: freshDuel.currentQuestionIndex,
        totalQuestions: freshDuel.questionIds.length,
        question,
        timeoutSeconds,
        challengerScore: freshDuel.challengerScore,
        opponentScore: freshDuel.opponentScore,
        challengerStreak: freshDuel.challengerStreak,
        opponentStreak: freshDuel.opponentStreak,
      });

      // Restart this player's blitz timer on rejoin
      if (freshDuel.mode === DuelMode.BLITZ) {
        const userId = client.data.userId as string;
        this.startBlitzTimer(freshDuel, userId);
      }
    } catch (err) {
      this.logger.error('emitQuestionReadyToSocket error', err);
    }
  }

  private startBlitzTimer(duel: Duel, userId: string): void {
    const key = `${duel.id}:${userId}`;
    const existing = this.blitzTimers.get(key);

    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.blitzTimers.delete(key);

      void this.duelsService
        .processAnswer(duel, userId, -1, null)
        .then(async (result) => {
          if (result.nextQuestionReady || result.suddenDeathStarted) {
            await this.emitQuestionReady(result.updatedDuel);
          }

          if (result.duelComplete) {
            this.clearAllTimers(duel.id);

            this.emitDuelCompletePerPlayer(result.updatedDuel, {
              winnerId: result.updatedDuel.winnerId,
              isTie: result.updatedDuel.isTie,
              challengerScore: result.updatedDuel.challengerScore,
              opponentScore: result.updatedDuel.opponentScore,
              prizeWon: result.updatedDuel.stake,
              suddenDeathRounds: result.updatedDuel.suddenDeathRound,
            });
          }
        })
        .catch((err) => {
          this.logger.error(`Blitz auto-submit error duel=${duel.id} user=${userId}`, err);
        });
    }, BLITZ_TIMEOUT_MS);

    this.blitzTimers.set(key, timer);
  }

  private async handleStealTimeout(duelId: string): Promise<void> {
    this.stealTimers.delete(duelId);

    try {
      const result = await this.duelsService.resolveExpiredSteal(duelId);
      const room = `duel:${duelId}`;

      this.server.to(room).emit(DuelEvents.STEAL_RESULT, {
        stealSuccess: false,
        stealerId: null,
        reason: 'timeout',
      });

      if (result.nextQuestionReady || result.suddenDeathStarted) {
        await this.emitQuestionReady(result.updatedDuel);
      }

      if (result.duelComplete) {
        this.clearAllTimers(duelId);

        this.emitDuelCompletePerPlayer(result.updatedDuel, {
          winnerId: result.updatedDuel.winnerId,
          isTie: result.updatedDuel.isTie,
          challengerScore: result.updatedDuel.challengerScore,
          opponentScore: result.updatedDuel.opponentScore,
          prizeWon: result.updatedDuel.stake,
          suddenDeathRounds: result.updatedDuel.suddenDeathRound,
        });
      }
    } catch (err) {
      this.logger.error(`handleStealTimeout error duel=${duelId}`, err);
    }
  }

  /**
   * Emit DUEL_COMPLETE to each participant individually so myProgression
   * carries that player's own snapshot, not their opponent's.
   * If per-player lookup throws for any reason, falls back to a room-wide
   * emit (myProgression: null) so DUEL_COMPLETE always reaches connected players.
   */
  private emitDuelCompletePerPlayer(
    duel: Duel,
    payload: Record<string, unknown>,
  ): void {
    try {
      const challengerSocket = this.findSocketByUserId(duel.challengerId);
      const opponentSocket = duel.opponentId
        ? this.findSocketByUserId(duel.opponentId)
        : undefined;

      if (challengerSocket) {
        challengerSocket.emit(DuelEvents.DUEL_COMPLETE, {
          ...payload,
          myProgression: duel.challengerProgression ?? null,
        });
      }

      if (opponentSocket) {
        opponentSocket.emit(DuelEvents.DUEL_COMPLETE, {
          ...payload,
          myProgression: duel.opponentProgression ?? null,
        });
      }
    } catch (err) {
      this.logger.error(
        `emitDuelCompletePerPlayer threw for duel ${duel.id}, falling back to room emit`,
        err,
      );
      try {
        this.server.to(`duel:${duel.id}`).emit(DuelEvents.DUEL_COMPLETE, {
          ...payload,
          myProgression: null,
        });
      } catch (roomErr) {
        this.logger.error(`Room emit fallback also failed for duel ${duel.id}`, roomErr);
      }
    }
  }

  private findSocketByUserId(userId: string): Socket | undefined {
    const socketId = this.userSocketMap.get(userId);
    if (!socketId) return undefined;
    // On a namespaced gateway, @WebSocketServer() injects the Namespace object.
    // Namespace.sockets is already the Map<socketId, Socket> — there is no .sockets.sockets.
    return (this.server.sockets as unknown as Map<string, Socket>).get(socketId);
  }

  private clearAllTimers(duelId: string): void {
    const forfeit = this.forfeitTimers.get(duelId);
    if (forfeit) {
      clearTimeout(forfeit);
      this.forfeitTimers.delete(duelId);
    }

    const steal = this.stealTimers.get(duelId);
    if (steal) {
      clearTimeout(steal);
      this.stealTimers.delete(duelId);
    }

    // Clear blitz timers for both players — we don't know the player IDs here,
    // so iterate all blitz keys for this duel
    for (const key of this.blitzTimers.keys()) {
      if (key.startsWith(`${duelId}:`)) {
        clearTimeout(this.blitzTimers.get(key)!);
        this.blitzTimers.delete(key);
      }
    }
  }
}
