import resolve from 'rollup-plugin-node-resolve';

const config = [
  {
    context: 'window',
    input: './js/main.js',
    output: {
      dir: './build/js',
      format: 'esm',
      sourcemap: true
    }
  },
  {
    input: [
      './node_modules/burgton-button/index.js'
    ],
    output: {
      file: './build/js/burgton-button-bundle.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      resolve({
        mainFields: ['module', 'main', 'browser', 'jsnext'],
        preferBuiltins: false
      }),
    ],
  },
  {
    input: [
      './node_modules/prismjs/prism.js'
    ],
    output: {
      file: './build/js/prismjs-bundle.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      resolve({
        mainFields: ['module', 'main', 'browser', 'jsnext'],
        preferBuiltins: false
      }),
    ],
  }
];

export default () => {
  return config;
}







// import resolve from 'rollup-plugin-node-resolve'
// import commonjs from 'rollup-plugin-commonjs'
// import postcss from 'rollup-plugin-postcss'
// import alias from 'rollup-plugin-alias'
// import { terser } from 'rollup-plugin-terser'
//
//
// const config = [
//   {
//     context: 'window',
//     input: './js/components/faul-container/faul-container.js',
//     output: {
//       dir: './build/js',
//       format: 'esm',
//       sourcemap: true
//     },
//     plugins: [
//       alias({
//         "lodash/fp/merge": __dirname + "/node_modules/lodash/fp/merge",
//         "lodash/fp/setWidth": __dirname + "/node_modules/lodash/fp/setWith",
//         "lodash/fp/assign": __dirname + "/node_modules/lodash/fp/assign",
//         "lodash/fp": __dirname + "/js/shim/lodash/fp",
//         "lodash": __dirname + "/node_modules/lodash-es/lodash"
//       }),
//       resolve({
//         mainFields: ['module', 'main', 'browser', 'jsnext'],
//         preferBuiltins: false
//       }),
//       commonjs({
//         include: 'node_modules/**'
//       }),
//       postcss({
//         inject: false
//       })
//     ],
//   }, {
//     input: [
//       './node_modules/@webcomponents/webcomponentsjs/webcomponents-loader.js'
//     ],
//     output: {
//       dir: './build/js',
//       format: 'esm',
//       sourcemap: true
//     },
//     plugins: [],
//   }
// ]
//
// export default () => {
//   if (process.env.NODE_ENV === 'production') {
//     config[0].plugins.push(terser())
//     config[1].plugins.push(terser())
//   } else {
//     config[0].cache = true,
//       config[0].treeshake = true
//   }
//
//   return config
// }
