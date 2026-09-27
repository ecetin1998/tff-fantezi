import purgecss from '@fullhuman/postcss-purgecss'
import cssnano from 'cssnano'

const dynamicSafelist=[
  'scope','active','compact','recommended','alternative','warning','critical',
  'good','neutral','tough','high','medium','low','edge','G','B','M',
  'GK','DEF','MID','FWD','is-return','is-emphasis'
]

const config={
  plugins: process.env.NODE_ENV==='production'
    ? [
        purgecss({
          content:['./app/**/*.js','./components/**/*.js'],
          defaultExtractor:content=>content.match(/[A-Za-z0-9_-]+/g)||[],
          safelist:{
            standard:dynamicSafelist,
            greedy:[/^row-/,/^position-/,/^team-/,/^match-/,/^player-/,/^readonly-/,/^my-/,/^bench-/,/^formation-/]
          }
        }),
        cssnano({preset:['default',{discardComments:{removeAll:true}}]})
      ]
    : []
}

export default config
