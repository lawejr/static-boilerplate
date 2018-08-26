'use strict';

const env = process.env.NODE_ENV;
const isDevelopment = !env || env === 'development';

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
      basePath + 'navigation.less'
    ],
    scripts: {
      all: basePath + 'components/**/*.js',
    }
  },
  build: './build/',
};

gulp.task('templates', function () {
  console.log('========== Подготовка исходного HTML');

  return gulp.src(paths.src.templates[0], { since: gulp.lastRun('templates') })
    .pipe($.nunjucks({
      path: paths.src.templates
    }))
    .pipe(gulp.dest(paths.build))
    .pipe($.if(isDevelopment, browserSync.stream()))
});

gulp.task('build', gulp.parallel(
  'templates',
  // 'styles',
  // 'scripts'
));

gulp.task('watch', function () {
  gulp.watch(paths.src.templates, gulp.series('templates'));
  // gulp.watch(paths.src.styles, gulp.series('styles:demo'));
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

gulp.task('default', gulp.series('build', gulp.parallel('watch', 'serve')));
