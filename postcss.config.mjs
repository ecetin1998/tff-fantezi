const config={
  plugins:{
    '@fullhuman/postcss-purgecss':{
      content:['./app/**/*.js','./components/**/*.js'],
      defaultExtractor:content=>content.match(/[A-Za-z0-9_-]+/g)||[],
      safelist:{
        standard:[
          'scope','active','compact','recommended','alternative','warning','critical',
          'good','neutral','tough','high','medium','low','edge','G','B','M',
          'GK','DEF','MID','FWD','is-return','is-emphasis'
        ],
        greedy:[/^row-(GK|DEF|MID|FWD)$/, /^position-(gk|def|mid|fwd)$/]
      }
    }
  }
}

export default config
