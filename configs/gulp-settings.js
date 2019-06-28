const webpack = require('webpack-stream').webpack
const env = process.env.NODE_ENV
const isDevelopment = !env || env === 'development'
const basePath = './source/'
const paths = {
  basePath: basePath,
  source: {
    templates: [
      basePath + 'views/pages/*.{html,njk}'
    ],
    styles: '**/styles/**/*.css',
    scripts: {
      all: basePath + 'scripts/**/*.{js,ts}',
      pages: basePath + 'scripts/pages/*.{js,ts}'
    },
    images: [
      basePath + 'images/**/*.{png,jpg,jpeg,svg}'
    ],
    static: [
      '!' + basePath + 'fonts/**/*.*',
      basePath + 'fonts/**/*.{woff,woff2}'
    ]
  },
  build: './build/',
  temporary: './build/.tmp/'
}
const webpackOptions = {
  mode: isDevelopment ? 'development' : 'production',
  watch: isDevelopment,
  resolve: {
    extensions: ['.ts', '.tsx']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'awesome-typescript-loader'
      }
    ]
  },
  plugins: [
    new webpack.NoEmitOnErrorsPlugin()
  ],
  output: {
    publicPath: '',
    filename: isDevelopment ? '[name].js' : '[name]-[chunkhash:10].js'
  }
}

module.exports = {
  isDevelopment,
  paths,
  webpackOptions
}
