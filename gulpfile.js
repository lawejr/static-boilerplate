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
const settings = require('./configs/gulp-settings')

// Initializations

const $ = gulpLoadPlugins({
  rename: {
    'gulp-nunjucks-render': 'nunjucks',
    'gulp-hash-filename': 'hash'
  }
})

// Parameters

const isDevelopment = settings.isDevelopment
const paths = settings.paths
const webpackOptions = settings.webpackOptions

// Tasks

gulp.task('templates', buildTemplates)
gulp.task('styles', buildStyles)
gulp.task('scripts', buildScripts)
gulp.task('lint:ts', lintTypescript)
gulp.task('images', compressImages)
gulp.task('copy', copyStatic)
gulp.task('watch', runWatching)
gulp.task('serve', startServer)
gulp.task('clean:build', cleanFolder.bind(this, paths.build))
gulp.task('clean:temp', cleanFolder.bind(this, paths.temporary))
gulp.task('build', gulp.series(
    'clean:build',
    gulp.parallel('styles', 'scripts'),
    gulp.parallel('templates', 'images', 'copy'),
    'clean:temp'
  )
)
gulp.task('build:development', gulp.series(
    'clean:build',
    gulp.parallel('styles', 'scripts', 'templates', 'images', 'copy')
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

  const mapPath = paths.temporary + 'map.json'
  let map = {}

  if (fs.existsSync(mapPath))  {
    map = JSON.parse(fs.readFileSync(mapPath))
  }

  const regExp = new RegExp(Object.keys(map).join('|'), 'g')

  return gulp
    .src(paths.source.templates, { since: gulp.lastRun('templates') })
    .pipe($.plumber({
      errorHandler: $.notify.onError()
    }))
    .pipe($.nunjucks({
      data: {
        Include: path.join(__dirname, paths.basePath + 'views/_include/')
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
    .src(paths.source.styles, { since: gulp.lastRun('styles') })
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

  return gulp.src(paths.source.scripts.pages)
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
    gulp.src(paths.source.scripts.all, { since: gulp.lastRun('lint:ts') }),
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

  return gulp.src(paths.source.images)
    .pipe($.if(!isDevelopment, $.imagemin()))
    .pipe($.flatten())
    .pipe(outToDestination('static/'))
}

function copyStatic() {
  console.log('========== Копирование статики')
  return gulp.src(paths.source.static).pipe(outToDestination('static/'))
}

function runWatching() {
  gulp.watch(paths.source.templates, gulp.series('templates'))
  gulp.watch(paths.source.styles, gulp.series('styles'))
  $.if(isDevelopment, gulp.watch(paths.source.scripts.all, gulp.series('lint:ts')))
}

function startServer() {
  browserSync.init({
    server: paths.build
  })
}

function cleanFolder(path) {
  console.log('========== Очистка папки ' + path)
  return del(path)
}

// Helpers

function createAssetsMap() {
  return through.obj((file, enc, cb) => {
    const filePath = path.parse(file.path)
    const nameChunks = filePath.name.split('-')
    const hash = nameChunks[nameChunks.length - 1].split('.')
    const key = filePath.name.replace(`-${hash}`, '') + filePath.ext
    const hashedName = filePath.name + filePath.ext
    const mapPath = paths.temporary + 'map.json'

    if (fs.existsSync(mapPath)) {
      const content = JSON.parse(fs.readFileSync(mapPath))

      content[key] = hashedName
      fs.writeFileSync(mapPath, JSON.stringify(content))
    } else {
      mkdir.sync(paths.temporary)
      fs.writeFileSync(mapPath, JSON.stringify({ [key]: hashedName }))
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
