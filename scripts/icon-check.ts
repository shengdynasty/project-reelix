import { iconFor } from '../src/motion/icons'
for (const t of [
  "Water covers about 71% of Earth's surface",
  'Most of that fresh water is out of reach',
  'Maple Street Bakery opened in 2019 as a two person stall selling sourdough',
  'The biggest jump came after the bakery launched a weekday bread subscription',
  'Cinnamon rolls are the best seller',
  'Students who kept their phones out of the bedroom slept 47 minutes longer',
  'Most students said they want to cut back',
  'Protecting rivers, lakes and aquifers protects almost everything',
  'The owners plan to open a second location',
  'Video apps took the most time each week',
  'Solar power capacity tripled',
]) console.log(iconFor(t).padEnd(22), t)
