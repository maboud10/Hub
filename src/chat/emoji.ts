/**
 * Curated emoji set for the picker, `:shortcode:` expansion and search.
 * Format per line: `<emoji> <shortcode> [keywords…]` (first word after the emoji is the shortcode).
 */

export type EmojiCategory = 'smileys' | 'people' | 'nature' | 'food' | 'activities' | 'travel' | 'objects' | 'symbols';

export interface EmojiEntry {
  e: string;
  code: string;
  keywords: string[];
  cat: EmojiCategory;
}

const RAW: Record<EmojiCategory, string> = {
  smileys: `😀 grinning smile happy
😃 smiley happy joy
😄 smile happy laugh
😁 grin teeth happy
😆 laughing lol haha
😅 sweat_smile phew relief
🤣 rofl rolling laugh
😂 joy tears laugh lol
🙂 slightly_smiling_face smile
🙃 upside_down_face silly
😉 wink
😊 blush happy shy
😇 innocent angel halo
🥰 smiling_face_with_hearts love adore
😍 heart_eyes love crush
🤩 star_struck wow amazing
😘 kissing_heart kiss
😋 yum delicious tasty
😛 stuck_out_tongue playful
😜 winking_tongue crazy
🤪 zany_face goofy wild
🤗 hugging_face hug
🤭 hand_over_mouth oops giggle
🤫 shushing_face secret quiet
🤔 thinking_face hmm think
🤐 zipper_mouth_face secret
🤨 raised_eyebrow skeptical
😐 neutral_face meh
😑 expressionless
😶 no_mouth speechless
😏 smirk
😒 unamused
🙄 face_with_rolling_eyes eyeroll
😬 grimacing awkward yikes
😌 relieved calm
😔 pensive sad
😪 sleepy tired
😴 sleeping zzz tired
😷 mask sick
🤒 face_with_thermometer sick ill
🤯 exploding_head mind_blown wow
🥳 partying_face party celebrate birthday
😎 sunglasses cool
🤓 nerd_face geek
🧐 monocle_face inspect
😕 confused
😟 worried
😮 open_mouth surprised wow
😲 astonished shocked
🥺 pleading_face please puppy
😢 cry sad tear
😭 sob crying
😱 scream fear omg
😤 triumph huff determined
😡 rage angry
😈 smiling_imp devil
💀 skull dead lol
🤡 clown_face
👻 ghost boo
👽 alien
🤖 robot bot ai
😺 smiley_cat cat
🙈 see_no_evil monkey oops
🙉 hear_no_evil monkey
🙊 speak_no_evil monkey`,
  people: `👍 +1 thumbsup yes agree like
👎 -1 thumbsdown no
👏 clap applause bravo
🙌 raised_hands celebrate hooray
👐 open_hands
🤝 handshake deal agree
🙏 pray thanks please
✌️ v peace victory
🤞 crossed_fingers luck hope
🤟 love_you_gesture
🤘 metal rock
👌 ok_hand perfect
🤌 pinched_fingers
👈 point_left
👉 point_right
👆 point_up
👇 point_down
✋ raised_hand hand stop
👋 wave hello hi bye
🤙 call_me_hand shaka
💪 muscle strong flex
🫶 heart_hands love
✍️ writing_hand write
🫡 saluting_face salute respect
🧠 brain smart think
👀 eyes look see watching
💅 nail_care
🧑‍💻 technologist developer coder laptop
🧑‍🎨 artist designer
🧑‍🚀 astronaut space
🦸 superhero hero
🧙 mage wizard
🕺 man_dancing dance
💃 dancer dance
🏃 runner run
🧘 person_in_lotus_position yoga zen`,
  nature: `🐶 dog puppy
🐱 cat kitten
🦊 fox
🐻 bear
🐼 panda
🐨 koala
🦁 lion
🐯 tiger
🐸 frog
🐵 monkey_face
🐧 penguin
🐦 bird
🦉 owl
🦄 unicorn magic
🐝 bee
🦋 butterfly
🐢 turtle slow
🐙 octopus
🐳 whale
🐬 dolphin
🌵 cactus desert
🌴 palm_tree beach
🌲 evergreen_tree
🌱 seedling grow
🍀 four_leaf_clover luck
🌸 cherry_blossom flower spring
🌻 sunflower
🌹 rose
🌈 rainbow
☀️ sunny sun
🌙 crescent_moon night
⛅ partly_sunny
🌧️ rain
❄️ snowflake cold winter
🌊 ocean wave sea
🌍 earth_africa world globe
🪐 ringed_planet saturn space`,
  food: `☕ coffee cafe latte
🍵 tea matcha
🧋 bubble_tea boba
🥤 cup_with_straw
🍺 beer
🍷 wine_glass
🥂 clinking_glasses cheers toast
🍾 champagne celebrate
🍕 pizza
🍔 hamburger burger
🌮 taco
🌯 burrito
🥙 stuffed_flatbread shawarma falafel
🍣 sushi
🍜 ramen noodles
🍝 spaghetti pasta
🥗 green_salad salad
🍳 cooking egg breakfast
🥐 croissant
🍩 doughnut donut
🍪 cookie
🎂 birthday cake
🍰 cake
🧁 cupcake
🍫 chocolate_bar
🍿 popcorn
🍎 apple
🍌 banana
🥑 avocado
🌶️ hot_pepper spicy
🧀 cheese
🍦 icecream`,
  activities: `🎉 tada party celebrate hooray
🎊 confetti_ball celebrate
🎈 balloon party
🎁 gift present
🏆 trophy win award
🥇 first_place_medal gold winner
🥈 second_place_medal
🥉 third_place_medal
🏅 sports_medal
🎯 dart target bullseye goal
🎮 video_game gaming
🕹️ joystick
🎲 game_die dice
♟️ chess_pawn chess strategy
🎨 art design paint
🎬 clapper film movie
🎤 microphone sing karaoke
🎧 headphones music focus
🎵 musical_note music
🎸 guitar
🥁 drum
⚽ soccer football
🏀 basketball
🎾 tennis
🏓 ping_pong padel
🏸 badminton
🏋️ weight_lifter gym
🚴 bicyclist bike
🏊 swimmer
🧩 jigsaw puzzle
🪄 magic_wand`,
  travel: `🚀 rocket launch ship fast
✈️ airplane flight travel
🚗 car
🚲 bike bicycle
🚇 metro subway
🗺️ world_map map
🏖️ beach_with_umbrella vacation
🏝️ desert_island
🏔️ snow_capped_mountain
🏙️ cityscape city
🏠 house home
🏢 office building
🏗️ building_construction wip
⛺ tent camping
🌃 night_with_stars
🎡 ferris_wheel
🕌 mosque
🛫 airplane_departure
⏰ alarm_clock time
⌛ hourglass wait
📅 date calendar`,
  objects: `💻 computer laptop code
🖥️ desktop_computer
⌨️ keyboard
📱 iphone phone mobile
🔋 battery
🔌 electric_plug
💡 bulb idea
📸 camera_with_flash photo
🎥 movie_camera video
📞 telephone_receiver call
📧 email mail
📦 package box ship
📝 memo note write
📌 pushpin pin
📎 paperclip attach
✂️ scissors cut
📁 file_folder folder
📊 bar_chart chart stats
📈 chart_with_upwards_trend growth up
📉 chart_with_downwards_trend down
📋 clipboard
📚 books learn read
🔍 mag search
🔧 wrench fix tool
🔨 hammer build
🛠️ hammer_and_wrench tools
⚙️ gear settings
🧪 test_tube experiment test
🔬 microscope research
🩹 adhesive_bandage fix patch
🛡️ shield security protect
🔐 closed_lock_with_key secure
🔑 key
💰 moneybag money
💸 money_with_wings spend
💳 credit_card
⏱️ stopwatch timer
🧯 fire_extinguisher incident
🚨 rotating_light alert incident siren
🔔 bell notification
📣 mega announce megaphone
🏷️ label tag
🪴 potted_plant plant
🧸 teddy_bear`,
  symbols: `❤️ heart love red
🧡 orange_heart
💛 yellow_heart
💚 green_heart
💙 blue_heart
💜 purple_heart
🖤 black_heart
🤍 white_heart
💖 sparkling_heart
💯 100 hundred perfect
💥 boom collision
💫 dizzy
💬 speech_balloon chat comment
💭 thought_balloon think
✨ sparkles magic shiny new
⭐ star favorite
🌟 star2 glow
⚡ zap lightning fast
🔥 fire lit hot
✅ white_check_mark done check yes
✔️ heavy_check_mark
❌ x no cross wrong
❗ exclamation important
❓ question
⚠️ warning caution
🚫 no_entry_sign forbidden
🆕 new
🔴 red_circle
🟢 green_circle
🟡 yellow_circle
🔵 blue_circle
➕ heavy_plus_sign plus add
🔁 repeat loop
🔒 lock secure private
🔓 unlock`,
};

export const EMOJI_CATEGORIES: { id: EmojiCategory; label: string }[] = [
  { id: 'smileys', label: 'Smileys' },
  { id: 'people', label: 'People' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food & drink' },
  { id: 'activities', label: 'Activities' },
  { id: 'travel', label: 'Travel & places' },
  { id: 'objects', label: 'Objects' },
  { id: 'symbols', label: 'Symbols' },
];

export const EMOJIS: EmojiEntry[] = (Object.keys(RAW) as EmojiCategory[]).flatMap((cat) =>
  RAW[cat]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [e, code, ...keywords] = line.split(/\s+/);
      return { e, code, keywords, cat };
    }),
);

const ALIASES: Record<string, string> = {
  thumbsup: '👍',
  thumbs_up: '👍',
  thumbsdown: '👎',
  heart: '❤️',
  party: '🎉',
  celebrate: '🎉',
  ok: '👌',
  check: '✅',
  done: '✅',
  lol: '😂',
  laugh: '😂',
  shrug: '🤷',
  eyes: '👀',
  ship: '🚀',
  ship_it: '🚀',
  shipit: '🚀',
  fire: '🔥',
  sparkle: '✨',
  coffee: '☕',
  cake: '🎂',
  wave: '👋',
  thanks: '🙏',
  smile: '😄',
  sad: '😢',
  cry: '😢',
  think: '🤔',
  mindblown: '🤯',
  star: '⭐',
  bug: '🐛',
  tada: '🎉',
  rocket: '🚀',
  crown: '👑',
  gem: '💎',
  hammer: '🔨',
};

/** shortcode → emoji */
export const EMOJI_BY_CODE: Map<string, string> = new Map([...EMOJIS.map((x) => [x.code, x.e] as [string, string]), ...Object.entries(ALIASES)]);

const BY_EMOJI = new Map(EMOJIS.map((x) => [x.e, x]));
/** emoji → shortcode name (for tooltips: “reacted with :rocket:”). */
export const emojiName = (e: string) => BY_EMOJI.get(e)?.code ?? [...EMOJI_BY_CODE.entries()].find(([, v]) => v === e)?.[0] ?? e;

/** Search by shortcode / keyword prefix. */
export function searchEmoji(query: string, limit = 60): EmojiEntry[] {
  const q = query.trim().toLowerCase().replace(/^:|:$/g, '');
  if (!q) return [];
  const scored: { x: EmojiEntry; s: number }[] = [];
  for (const x of EMOJIS) {
    let s = 0;
    if (x.code === q) s = 100;
    else if (x.code.startsWith(q)) s = 80 - x.code.length * 0.1;
    else if (x.code.includes(q)) s = 50;
    else if (x.keywords.some((k) => k.startsWith(q))) s = 40;
    else if (x.keywords.some((k) => k.includes(q))) s = 20;
    if (s) scored.push({ x, s });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.x);
}
