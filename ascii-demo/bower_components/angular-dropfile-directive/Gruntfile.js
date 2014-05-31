module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    uglify: {
      dist: {
        files: {
          'tmp/dropfile/dropfile.js': ['dropfile/dropfile.js']
        }
      }
    },
    concat: {
      options: {
        stripBanners: true,
        banner: '/*!\n <%= pkg.name %> - v<%= pkg.version %> - ' +
        '<%= grunt.template.today("yyyy-mm-dd") %> \n\n' +
        '======================================= \n' +
        '*/\n\n',
      },
      dist: {
        src: [
          // Do not change order
          'tmp/dropfile/dropfile.js',
          'src/<%= pkg.file %>.js',
        ],
        dest: 'dist/<%= pkg.file %>.all.js',
      },
    },

    // Empties folders to start fresh
    clean: {
      dist: {
        files: [{
          dot: true,
          src: [
            'tmp',
            'dist/*',
          ]
        }]
      }
    },
    copy: {
      main: {
        files: [
          // includes files within path
          {
            expand: true, 
            cwd: 'dropfile',
            src: [
              '*.xap'
              ], 
            dest: 'dist/',
            filter: 'isFile'
          }
        ]
      }
    },
    // Test settings
    karma: {
      unit: {
        configFile: 'karma.conf.js',
        singleRun: true
      }
    }
  });

  // Load the plugin that provides the "uglify" task.
  // 
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-karma');

  // Default task(s).
  grunt.registerTask('default', ['dist']);
  grunt.registerTask('dist', ['clean', 'uglify', 'concat', 'copy']);// Default task.
  grunt.registerTask('test', ['dist', 'karma']);

};