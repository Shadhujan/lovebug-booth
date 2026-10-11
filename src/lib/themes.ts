import type { ThemeKey } from '../types';

export const THEMES: Record<ThemeKey, { name: string; note: string; background: string; paper: string; ink: string; highlight: string; pattern: string }> = {
  strawberry: { name: 'Strawberry milk', note: 'pink, bows & butterflies', background: '#f8b5c6', paper: '#fff6f3', ink: '#983f65', highlight: '#ffe3ea', pattern: '#ee809b' },
  peach: { name: 'Peachy kiss', note: 'warm & cozy sweetness', background: '#f5b99f', paper: '#fff8ef', ink: '#a55f4f', highlight: '#fbe6cf', pattern: '#e9998d' },
  lilac: { name: 'Lavender crush', note: 'dreamy little moments', background: '#c8b4e8', paper: '#fcf8ff', ink: '#77609b', highlight: '#efddfc', pattern: '#b19bdc' },
  mint: { name: 'Minty date', note: 'fresh, soft & silly', background: '#b4ddd0', paper: '#f5fffa', ink: '#4c7f75', highlight: '#dbf3e5', pattern: '#83c7ae' },
};

export const POSES = [
  'Make the worst heart shape possible ♡',
  'Look like someone stole your last fry',
  'Pretend it is your wedding magazine cover',
  'One is the princess, one is the bodyguard',
  'Give your favorite human a cheek squish',
  'Pose like you are in a dramatic K-drama',
  'Make the silliest face you can think of',
  'Look at each other and try not to laugh',
  'Do your most ridiculous model pose',
];

export const STICKERS = [
  { id: 'bow', name: 'Pink bow', src: '/stickers/bow.svg' },
  { id: 'heart', name: 'Puffy heart', src: '/stickers/heart.svg' },
  { id: 'bear', name: 'Sweet bear', src: '/stickers/bear.svg' },
  { id: 'bunny', name: 'Blushing bunny', src: '/stickers/bunny.svg' },
  { id: 'cherries', name: 'Cherry date', src: '/stickers/cherries.svg' },
  { id: 'flower', name: 'Little flower', src: '/stickers/flower.svg' },
  { id: 'sparkle', name: 'Twinkles', src: '/stickers/sparkle.svg' },
  { id: 'envelope', name: 'Love letter', src: '/stickers/envelope.svg' },
  { id: 'strawberry', name: 'Strawberry', src: '/stickers/strawberry.svg' },
  { id: 'star', name: 'Golden star', src: '/stickers/star.svg' },
  { id: 'kiss', name: 'Kiss!', src: '/stickers/kiss.svg' },
  { id: 'cat', name: 'Little kitty', src: '/stickers/cat.svg' },
  { id: 'flower2', name: 'Blue daisy', src: '/stickers/flower2.svg' },
  { id: 'cake', name: 'Love cake', src: '/stickers/cake.svg' },
];

export const TEXT_IDEAS = [
  'certified cuties', 'kiss attack!', 'my favorite human', 'us, always ♡', 'tiny love disaster', 'mwah!', 'lovebug club', 'silly little us',
];

export function freshDraft(): import('../types').EditorDraft {
  return { stickers: [], strokes: [], filter: 'none', caption: 'just us, always ♡' };
}

export function makeId() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()); }
