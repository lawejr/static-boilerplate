'use strict';

const env = process.env.NODE_ENV;
const isDevelopment = !env || env === 'development';
const path = require('path');
const gulp = require('gulp');
const $ = require('gulp-load-plugins')({
  rename: {
    'gulp-nunjucks-render': 'nunjucks',
    'gulp-hash-filename': 'hash'
  }
});
const fs = require('fs');
const through = require('through2');
const del = require('del');
const browserSync = require('browser-sync').create();
const webpackStream = require('webpack-stream');
const webpack = webpackStream.webpack;
const combiner = require('stream-combiner2').obj;
const named = require('vinyl-named');
const mkdir = require('mkdirp');

const basePath = './src/';
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
};

const out = function (tail) {
  let destPath = paths.build;

  if (tail) {
    destPath += tail;
  }

  return gulp.dest.call(gulp, destPath);
};
let webpackOptions = {
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
};

gulp.task('templates', function () {
  console.log('========== Подготовка исходного HTML');

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
      $.if(!isDevelopment, $.replace(regExp, function(match) {
        return map[match]
      })
      .pipe($.htmlmin({
        collapseInlineTagWhitespace: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true,
        removeComments: true
      }))
    ))
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
    .pipe(
      $.if(!isDevelopment,
        $.hash()
        .pipe(assetsMap())
        .pipe($.autoprefixer({
          cascade: true
        }))
        .pipe($.csso())
      )
    )
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
    .pipe($.if(!isDevelopment, assetsMap()))
    .pipe(out())
    .on('data', function () {
      if (firstBuildReady) {
        callback()
      }
    })
    .pipe($.if(isDevelopment, browserSync.stream()))
});

gulp.task('lint:ts', function () {
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
});

gulp.task('img:opti', function () {
  const action = isDevelopment ? 'Копирование' : 'Оптимизация';
  console.log('========== ' + action + ' изображений');

  return gulp.src(paths.src.img)
    .pipe($.if(!isDevelopment, $.imagemin()))
    .pipe($.flatten())
    .pipe(out('static/'))
});

gulp.task('copy', function () {
  console.log('========== Копирование статики');

  return gulp.src(paths.src.static)
    .pipe(out('static/'))
});

gulp.task('watch', function () {
  gulp.watch(paths.src.templates, gulp.series('templates'));
  gulp.watch(paths.src.styles, gulp.series('styles'));
  $.if(isDevelopment, gulp.watch(paths.src.scripts.all, gulp.series('lint:ts')));
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
  gulp.parallel('styles', 'scripts'),
  gulp.parallel('templates', 'img:opti', 'copy'))
);

gulp.task('build:development', gulp.series(
  'clean',
  gulp.parallel('styles', 'scripts', 'templates', 'img:opti', 'copy'))
);

gulp.task('default', gulp.series('lint:ts', 'build:development', gulp.parallel('watch', 'serve')));

function assetsMap() {
  return through.obj((file, enc, cb) => {
    const filePath = path.parse(file.path)
    const nameChunks = filePath.name.split('-')
    const hash = nameChunks[nameChunks.length - 1].split('.')
    const key = filePath.name.replace(`-${hash}`, '') + filePath.ext
    const hashedName = filePath.name + filePath.ext
    const mapPath = paths.build + 'map.json'

    if (!fs.existsSync(mapPath)) {
      mkdir(paths.build)
      fs.writeFileSync(paths.build + 'map.json', JSON.stringify({ [key]: hashedName }))
    } else {
      const content = JSON.parse(fs.readFileSync(mapPath))
      fs.writeFileSync(paths.build + 'map.json', JSON.stringify(Object.assign(content, { [key]: hashedName })))
    }

    return cb(null, file);
  });
}
