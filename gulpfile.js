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
      all: basePath + 'components/**/*.js',
    }
  },
  build: './build/',
};

const out = gulp.dest.bind(gulp, paths.build);

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
    .pipe($.csso())
    .pipe(out())
    .pipe($.if(isDevelopment, browserSync.stream()))
});

gulp.task('watch', function () {
  gulp.watch(paths.src.templates, gulp.series('templates'));
  gulp.watch(paths.src.styles, gulp.series('styles'));
  // $.if(isDevelopment, gulp.watch(paths.src.scripts.all, gulp.series('lint:js')));
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
    // 'scripts'
  ))
);

gulp.task('default', gulp.series('build', gulp.parallel('watch', 'serve')));
