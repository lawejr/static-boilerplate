'use strict';

const env = process.env.NODE_ENV;
const isDevelopment = !env || env === 'development';

const path = require('path');
const gulp = require('gulp');
const $ = require('gulp-load-plugins')({
  rename: {
    'gulp-nunjucks-render': 'nunjucks'
  }
});
const del = require('del');
const browserSync = require('browser-sync').create();
const webpackStream = require('webpack-stream');
const webpack = webpackStream.webpack;
const combiner = require('stream-combiner2').obj;
const named = require('vinyl-named');

const basePath = './src/';
const paths = {
  src: {
    templates: [
      basePath + 'views/pages/*.{html,njk}'
    ],
    styles: [
      basePath + 'styles/general.css',
      basePath + 'styles/pages/*.css'
    ],
    scripts: {
      all: basePath + 'scripts/**/*.js',
      pages: basePath + 'scripts/pages/*.js'
    }
  },
  build: './build/',
};

const out = gulp.dest.bind(gulp, paths.build);
let webpackOptions = {
  mode: isDevelopment ? 'development' : 'production',
  watch: isDevelopment,
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'babel-loader'
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
};

gulp.task('templates', function () {
  console.log('========== Подготовка исходного HTML');

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
    .pipe(out())
    .pipe($.if(isDevelopment, browserSync.stream()))
});

gulp.task('styles', function () {
  console.log('========== Подготовка исходного CSS');

  return gulp
    .src(paths.src.styles, { since: gulp.lastRun('styles') })
    .pipe($.plumber({
      errorHandler: $.notify.onError()
    }))
    .pipe($.if(isDevelopment, $.stylelint({
      reporters: [{ formatter: 'string', console: true }]
    })))
    .pipe($.autoprefixer({
      browsers: ['last 2 versions', 'ie >= 11'],
      cascade: true
    }),)
    .pipe($.if(!isDevelopment, $.csso()))
    .pipe(out())
    .pipe($.if(isDevelopment, browserSync.stream()))
});

gulp.task('scripts', function (callback) {
  console.log('========== Подготовка исходного JS');

  let firstBuildReady = false;

  function done (err, stats) {
    firstBuildReady = true;
    if (err) return;
    console.log(stats.toString({ colors: true }));
  }

  return gulp.src(paths.src.scripts.pages)
    .pipe($.plumber({
      errorHandler: $.notify.onError()
    }))
    .pipe(named())
    .pipe(webpackStream(webpackOptions, null, done))
    .pipe($.if(!isDevelopment, $.uglify()))
    .pipe(out())
    .on('data', function () {
      if (firstBuildReady) {
        callback()
      }
    })
    .pipe($.if(isDevelopment, browserSync.stream()))
});

gulp.task('lint:js', function () {
  return combiner(
    gulp.src(paths.src.scripts.all, { since: gulp.lastRun('lint:js') }),
    $.eslint(),
    $.eslint.format(),
    $.eslint.failAfterError()
  ).on('error', $.notify.onError())
});

gulp.task('watch', function () {
  gulp.watch(paths.src.templates, gulp.series('templates'));
  gulp.watch(paths.src.styles, gulp.series('styles'));
  $.if(isDevelopment, gulp.watch(paths.src.scripts.all, gulp.series('lint:js')));
});

gulp.task('serve', function () {
  browserSync.init({
    server: paths.build
  })
});

gulp.task('clean', function () {
  console.log('========== Очистка папок сборки');

  return del(paths.build)
});

gulp.task('build', gulp.series(
  'clean',
  gulp.parallel(
    'templates',
    'styles',
    'scripts'
  ))
);

gulp.task('default', gulp.series('lint:js', 'build', gulp.parallel('watch', 'serve')));
