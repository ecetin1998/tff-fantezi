import purgecss from '@fullhuman/postcss-purgecss'

const dynamicSafelist=[
  'scope','active','compact','recommended','alternative','warning','critical',
  'good','neutral','tough','high','medium','low','edge','G','B','M',
  'GK','DEF','MID','FWD','is-return','is-emphasis',
  'historical_frozen','live_frozen','reconstructed','preseason_replay',
  'closed','replay_pending','cold_start_gap','bias-up','bias-down'
]

const config={
  plugins: process.env.NODE_ENV==='production'
    ? [purgecss({
        content:['./app/**/*.js','./components/**/*.js'],
        defaultExtractor:content=>content.match(/[A-Za-z0-9_-]+/g)||[],
        safelist:{
          standard:[
            ...dynamicSafelist,
            /^position-(gk|def|mid|fwd)$/i
          ]
        }
      })]
    : []
}

export default config
