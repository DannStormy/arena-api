import { CreateQuestionDto } from '../dto/create-question.dto';
import { QuestionCategory } from '../types/question-category.enum';
import { QuestionDifficulty } from '../types/question-difficulty.enum';

const E = QuestionDifficulty.EASY;
const M = QuestionDifficulty.MEDIUM;
const H = QuestionDifficulty.HARD;

/**
 * Bundled starter question bank: genuinely general-knowledge, family-friendly,
 * no emoji, spread across every QuestionCategory and difficulty. Inserted once,
 * idempotently, only when the questions table is empty (see QuestionsSeedService)
 * so a fresh/empty deployed DB self-populates and trivia becomes playable.
 *
 * Each entry respects @Unique(['content','category']); correctAnswer is the
 * zero-based index into options[4].
 */
export const SEED_QUESTIONS: CreateQuestionDto[] = [
  // ── BRAIN_BOX (science / geography / history) ──────────────────────────────
  q('What is the largest planet in our solar system?', ['Earth', 'Jupiter', 'Mars', 'Saturn'], 1, QuestionCategory.BRAIN_BOX, E),
  q('How many continents are there on Earth?', ['Five', 'Six', 'Seven', 'Eight'], 2, QuestionCategory.BRAIN_BOX, E),
  q('What gas do plants mainly absorb from the air?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], 2, QuestionCategory.BRAIN_BOX, E),
  q('What is the hardest known natural material?', ['Gold', 'Iron', 'Diamond', 'Quartz'], 2, QuestionCategory.BRAIN_BOX, E),
  q('What is the chemical symbol for gold?', ['Go', 'Gd', 'Au', 'Ag'], 2, QuestionCategory.BRAIN_BOX, M),
  q('Which is generally regarded as the longest river in the world?', ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], 1, QuestionCategory.BRAIN_BOX, M),
  q('In which year did World War II end?', ['1943', '1945', '1947', '1950'], 1, QuestionCategory.BRAIN_BOX, M),
  q('How many bones are in the adult human body?', ['206', '201', '215', '198'], 0, QuestionCategory.BRAIN_BOX, H),

  // ── SPORTS_ARENA ───────────────────────────────────────────────────────────
  q('How many players from one team are on the field in soccer?', ['Nine', 'Ten', 'Eleven', 'Twelve'], 2, QuestionCategory.SPORTS_ARENA, E),
  q('In which sport would you perform a slam dunk?', ['Tennis', 'Basketball', 'Cricket', 'Golf'], 1, QuestionCategory.SPORTS_ARENA, E),
  q('How many rings are on the Olympic flag?', ['Four', 'Five', 'Six', 'Seven'], 1, QuestionCategory.SPORTS_ARENA, E),
  q('How often are the Summer Olympic Games normally held?', ['Every year', 'Every two years', 'Every four years', 'Every five years'], 2, QuestionCategory.SPORTS_ARENA, E),
  q('In tennis, what term is used for a score of zero?', ['Love', 'Nil', 'Blank', 'Duck'], 0, QuestionCategory.SPORTS_ARENA, M),
  q('How many points is a touchdown worth in American football?', ['Three', 'Six', 'Seven', 'Two'], 1, QuestionCategory.SPORTS_ARENA, M),
  q("Which country has won the most men's FIFA World Cup titles?", ['Germany', 'Italy', 'Brazil', 'Argentina'], 2, QuestionCategory.SPORTS_ARENA, M),
  q('How many players are in each team in a cricket match?', ['Nine', 'Ten', 'Eleven', 'Twelve'], 2, QuestionCategory.SPORTS_ARENA, H),

  // ── ENTERTAINMENT_ZONE (film / music / general pop culture) ────────────────
  q('Which animated movie features a lion cub named Simba?', ['The Lion King', 'Finding Nemo', 'Aladdin', 'Shrek'], 0, QuestionCategory.ENTERTAINMENT_ZONE, E),
  q('How many strings does a standard guitar have?', ['Four', 'Five', 'Six', 'Seven'], 2, QuestionCategory.ENTERTAINMENT_ZONE, E),
  q('Who is the author of the Harry Potter book series?', ['J.R.R. Tolkien', 'J.K. Rowling', 'Roald Dahl', 'C.S. Lewis'], 1, QuestionCategory.ENTERTAINMENT_ZONE, E),
  q('In which city is the Hollywood film industry based?', ['New York', 'Chicago', 'Los Angeles', 'Miami'], 2, QuestionCategory.ENTERTAINMENT_ZONE, E),
  q('Which classic board game involves buying properties and paying rent?', ['Scrabble', 'Monopoly', 'Clue', 'Risk'], 1, QuestionCategory.ENTERTAINMENT_ZONE, E),
  q('Which musical instrument has 88 keys?', ['Organ', 'Piano', 'Accordion', 'Harp'], 1, QuestionCategory.ENTERTAINMENT_ZONE, M),
  q('What is the name of the fictional African nation in Black Panther?', ['Zamunda', 'Wakanda', 'Genovia', 'Narnia'], 1, QuestionCategory.ENTERTAINMENT_ZONE, M),
  q("In film production, what does 'OST' usually stand for?", ['Original Sound Track', 'Open Screen Test', 'On Stage Talent', 'Optical Sound Tool'], 0, QuestionCategory.ENTERTAINMENT_ZONE, H),

  // ── TECH_AND_HUSTLE (technology / business) ────────────────────────────────
  q("What does 'CPU' stand for?", ['Central Processing Unit', 'Computer Personal Unit', 'Central Power Unit', 'Control Processing Utility'], 0, QuestionCategory.TECH_AND_HUSTLE, E),
  q('Which company created the iPhone?', ['Samsung', 'Apple', 'Google', 'Nokia'], 1, QuestionCategory.TECH_AND_HUSTLE, E),
  q("What does 'WWW' stand for?", ['World Web Wide', 'Web World Wide', 'World Wide Web', 'Wide World Web'], 2, QuestionCategory.TECH_AND_HUSTLE, E),
  q('Which company develops the Android operating system?', ['Apple', 'Microsoft', 'Google', 'Amazon'], 2, QuestionCategory.TECH_AND_HUSTLE, E),
  q("In business, what does 'ROI' stand for?", ['Rate Of Interest', 'Return On Investment', 'Risk Of Inflation', 'Record Of Income'], 1, QuestionCategory.TECH_AND_HUSTLE, M),
  q('Which programming language shares its name with an Indonesian island?', ['Python', 'Java', 'Ruby', 'Swift'], 1, QuestionCategory.TECH_AND_HUSTLE, M),
  q('What is the name of the digital currency introduced in 2009?', ['Bitcoin', 'Ethereum', 'Litecoin', 'Dogecoin'], 0, QuestionCategory.TECH_AND_HUSTLE, M),
  q("What does 'HTTP' stand for?", ['HyperText Transfer Protocol', 'High Transfer Text Protocol', 'HyperText Transmission Process', 'Home Tool Transfer Protocol'], 0, QuestionCategory.TECH_AND_HUSTLE, H),

  // ── FAITH_AND_VALUES (world religions / values, neutral & factual) ─────────
  q('What is the holy book of Islam called?', ['Torah', 'Bible', 'Quran', 'Vedas'], 2, QuestionCategory.FAITH_AND_VALUES, E),
  q('Which value means telling the truth?', ['Honesty', 'Greed', 'Envy', 'Pride'], 0, QuestionCategory.FAITH_AND_VALUES, E),
  q('The Golden Rule teaches people to treat others how?', ['However they wish', 'As they would like to be treated', 'Only if rewarded', 'Worse than themselves'], 1, QuestionCategory.FAITH_AND_VALUES, E),
  q('Which value describes being thankful for what one has?', ['Gratitude', 'Jealousy', 'Laziness', 'Anger'], 0, QuestionCategory.FAITH_AND_VALUES, E),
  q('Which festival is known as the Hindu festival of lights?', ['Diwali', 'Holi', 'Eid', 'Passover'], 0, QuestionCategory.FAITH_AND_VALUES, M),
  q('Which city is a central holy site for Judaism, Christianity, and Islam?', ['Cairo', 'Jerusalem', 'Athens', 'Rome'], 1, QuestionCategory.FAITH_AND_VALUES, M),
  q('In the Bible, the Ten Commandments are most associated with which figure?', ['Abraham', 'Moses', 'David', 'Noah'], 1, QuestionCategory.FAITH_AND_VALUES, M),
  q('Excluding Sundays, how many days are in the Christian season of Lent?', ['Thirty', 'Forty', 'Fifty', 'Sixty'], 1, QuestionCategory.FAITH_AND_VALUES, H),

  // ── NAIJA_STREET_SMARTS (Nigeria / Africa general knowledge) ───────────────
  q('What is the capital city of Nigeria?', ['Lagos', 'Abuja', 'Kano', 'Ibadan'], 1, QuestionCategory.NAIJA_STREET_SMARTS, E),
  q('What is the official currency of Nigeria?', ['Cedi', 'Naira', 'Shilling', 'Rand'], 1, QuestionCategory.NAIJA_STREET_SMARTS, E),
  q('Which ocean lies to the south of Nigeria?', ['Indian Ocean', 'Atlantic Ocean', 'Pacific Ocean', 'Arctic Ocean'], 1, QuestionCategory.NAIJA_STREET_SMARTS, E),
  q('Which of these is one of the three major Nigerian languages?', ['Swahili', 'Yoruba', 'Zulu', 'Amharic'], 1, QuestionCategory.NAIJA_STREET_SMARTS, E),
  q('The Sahara Desert covers much of which part of Africa?', ['Southern Africa', 'Northern Africa', 'Central Africa', 'Eastern Africa'], 1, QuestionCategory.NAIJA_STREET_SMARTS, E),
  q('In which year did Nigeria gain independence from Britain?', ['1957', '1960', '1963', '1970'], 1, QuestionCategory.NAIJA_STREET_SMARTS, M),
  q('What is the tallest mountain in Africa?', ['Mount Kenya', 'Mount Kilimanjaro', 'Table Mountain', 'Mount Cameroon'], 1, QuestionCategory.NAIJA_STREET_SMARTS, M),
  q('Which is the longest river in Nigeria?', ['River Benue', 'River Niger', 'River Ogun', 'River Kaduna'], 1, QuestionCategory.NAIJA_STREET_SMARTS, M),
];

function q(
  content: string,
  options: string[],
  correctAnswer: number,
  category: QuestionCategory,
  difficulty: QuestionDifficulty,
): CreateQuestionDto {
  return { content, options, correctAnswer, category, difficulty };
}
