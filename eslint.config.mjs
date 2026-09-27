import {defineConfig,globalIgnores} from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  {
    settings:{
      'import/resolver':{
        typescript:{project:'./jsconfig.json'},
        node:{extensions:['.js','.jsx','.mjs','.ts','.tsx']}
      }
    },
    rules:{
      'react/no-unescaped-entities':'off',
      'react-hooks/set-state-in-effect':'off',
      'react-hooks/immutability':'off',
      'react-hooks/preserve-manual-memoization':'off',
      'no-undef':'error',
      'import/named':'error',
      'import/no-unresolved':['error',{ignore:['^server-only$']}]
    }
  },
  {
    files:['supabase/functions/**/*.{ts,js}'],
    rules:{
      'no-undef':'off',
      'import/no-unresolved':'off'
    }
  },
  globalIgnores(['.next/**','out/**','node_modules/**'])
])
