'use strict'

// Imports

const path = require('path')
const gulp = require('gulp')
const gulpLoadPlugins = require('gulp-load-plugins')
const fs = require('fs')
const through = require('through2')
const del = require('del')
const browserSync = require('browser-sync').create()
const webpackStream = require('webpack-stream')
const combiner = require('stream-combiner2').obj
const named = require('vinyl-named')
const mkdir = require('mkdirp')

// Initializations

const webpack = webpackStream.webpack
const $ = gulpLoadPlugins({
  rename: {
    'gulp-nunjucks-render': 'nunjucks',
    'gulp-hash-filename': 'hash'
  }
})

// Parameters

const env = process.env.NODE_ENV
const isDevelopment = !env || env === 'development'
const basePath = './src/'
const paths = {
  src: {
    templates: [
      basePath + 'views/pages/*.{html,njk}'
    ],
    styles: [
      basePath + 'styles/fonts.css',
      basePath + 'styles/general.css',
      basePath + 'styles/pages/*.css'
    ],
    scripts: {
      all: basePath + 'scripts/**/*.{js,ts}',
      pages: basePath + 'scripts/pages/*.{js,ts}'
    },
    img: [
      basePath + 'img/**/*.{png,jpg,jpeg,svg}'
    ],
    static: [
      '!' + basePath + 'fonts/**/*.*',
      basePath + 'fonts/**/*.{woff,woff2}'
    ]
  },
  build: './build/'
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

// Tasks

gulp.task('templates', buildTemplates)
gulp.task('styles', buildStyles)
gulp.task('scripts', buildScripts)
gulp.task('lint:ts', lintTypescript)
gulp.task('img:opti', compressImages)
gulp.task('copy', copyStatic)
gulp.task('watch', runWatching)
gulp.task('serve', startServer)
gulp.task('clean', cleanBuildFolder)
gulp.task('build', gulp.series(
    'clean',
    gulp.parallel('styles', 'scripts'),
    gulp.parallel('templates', 'img:opti', 'copy')
  )
)
gulp.task('build:development', gulp.series(
    'clean',
    gulp.parallel('styles', 'scripts', 'templates', 'img:opti', 'copy')
  )
)
gulp.task('default', gulp.series(
    'lint:ts', 'build:development',
    gulp.parallel('watch', 'serve')
  )
)

// Task functions

function buildTemplates() {
  console.log('========== Подготовка исходного HTML')

  const mapPath = paths.build + 'map.json'
  let map = {}

  if (fs.existsSync(mapPath))  {
    map = JSON.parse(fs.readFileSync(mapPath))
  }

  const regExp = new RegExp(Object.keys(map).join('|'), 'g')

  return gulp
    .src(paths.src.templates, { since: gulp.lastRun('templates') })
    .pipe($.plumber({
      errorHandler: $.notify.onError()
    }))
    .pipe($.nunjucks({
      data: {
        Include: path.join(__dirname, basePath + 'views/_include/')
      }
    }))
    .pipe(
      $.if(!isDevelopment, combiner(
        $.replace(regExp, (match) => map[match]),
        $.htmlmin({
          collapseInlineTagWhitespace: true,
          collapseWhitespace: true,
          removeAttributeQuotes: true,
          removeComments: true
        }))
      )
    )
    .pipe(outToDestination())
    .pipe($.if(isDevelopment, browserSync.stream()))
}

function buildStyles() {
  console.log('========== Подготовка исходного CSS')

  return gulp
    .src(paths.src.styles, { since: gulp.lastRun('styles') })
    .pipe($.plumber({
      errorHandler: $.notify.onError()
    }))
    .pipe($.if(isDevelopment, $.stylelint({
      reporters: [{ formatter: 'string', console: true }]
    })))
    .pipe(
      $.if(!isDevelopment, combiner(
        $.hash(),
        createAssetsMap(),
        $.autoprefixer({
          cascade: true
        }),
        $.csso()
    ))
    )
    .pipe(outToDestination())
    .pipe($.if(isDevelopment, browserSync.stream()))
}

function buildScripts(callback) {
  console.log('========== Подготовка исходного JS')

  let firstBuildReady = false

  const done = (err, stats) => {
    firstBuildReady = true
    if (!err) {
      console.log(stats.toString({ colors: true }))
    }
  }

  return gulp.src(paths.src.scripts.pages)
    .pipe($.plumber({
      errorHandler: $.notify.onError()
    }))
    .pipe(named())
    .pipe(webpackStream(webpackOptions, null, done))
    .pipe($.if(!isDevelopment, createAssetsMap()))
    .pipe(outToDestination())
    .on('data', function () {
      if (firstBuildReady) {
        callback()
      }
    })
    .pipe($.if(isDevelopment, browserSync.stream()))
}

function lintTypescript() {
  return combiner(
    gulp.src(paths.src.scripts.all, { since: gulp.lastRun('lint:ts') }),
    $.tslint({
      configuration: "./tslint.json"
    }),
    $.tslint.report({
      emitError: true,
      summarizeFailureOutput: true,
    })
  ).on('error', $.notify.onError())
}

function compressImages() {
  const action = isDevelopment ? 'Копирование' : 'Оптимизация'
  console.log('========== ' + action + ' изображений')

  return gulp.src(paths.src.img)
    .pipe($.if(!isDevelopment, $.imagemin()))
    .pipe($.flatten())
    .pipe(outToDestination('static/'))
}

function copyStatic() {
  console.log('========== Копирование статики')
  return gulp.src(paths.src.static).pipe(outToDestination('static/'))
}

function runWatching() {
  gulp.watch(paths.src.templates, gulp.series('templates'))
  gulp.watch(paths.src.styles, gulp.series('styles'))
  $.if(isDevelopment, gulp.watch(paths.src.scripts.all, gulp.series('lint:ts')))
}

function startServer() {
  browserSync.init({
    server: paths.build
  })
}

function cleanBuildFolder() {
  console.log('========== Очистка папок сборки')
  return del(paths.build)
}

// Helpers

function createAssetsMap() {
  return through.obj((file, enc, cb) => {
    const filePath = path.parse(file.path)
    const nameChunks = filePath.name.split('-')
    const hash = nameChunks[nameChunks.length - 1].split('.')
    const key = filePath.name.replace(`-${hash}`, '') + filePath.ext
    const hashedName = filePath.name + filePath.ext
    const mapPath = paths.build + 'map.json'

    if (fs.existsSync(mapPath)) {
      const content = JSON.parse(fs.readFileSync(mapPath))

      content[key] = hashedName
      fs.writeFileSync(paths.build + 'map.json', JSON.stringify(content))
    } else {
      mkdir(paths.build)
      fs.writeFileSync(paths.build + 'map.json', JSON.stringify({ [key]: hashedName }))
    }

    return cb(null, file)
  })
}

function outToDestination(tail) {
  let destPath = paths.build

  if (tail) {
    destPath += tail
  }

  return gulp.dest.call(gulp, destPath)
}
