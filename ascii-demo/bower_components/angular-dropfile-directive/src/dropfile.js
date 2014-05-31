/**
 * angular-dropfile-directive v0.0.1
 * (c) 2014 Anthonny Querouil  @anthonny_q
 * License: MIT
 */
 'use strict';

 angular.module('aql.directives.dropfile', []).
 directive('dropfile', function(){
 	return {
			restrict: 'A',
			scope: {
				model: '=ngModel',
				onDragOver: '&?',
				onDragEnter: '&?',
				onDragLeave: '&?',
				onDrop: '&?'
			},
			link: function(scope, element, attrs) {

				var dragoverCallback = scope.onDragOver || angular.noop;
				var dragenterCallback =  scope.onDragEnter || angular.noop;
				var dragleaveCallback = scope.onDragLeave || angular.noop;
				var dropCallback = scope.onDrop || angular.noop;

				element.bind('dragover', function(event) {	
    				dragoverCallback({event: event});
					element.addClass('dragover');
					event.preventDefault();
				});

				element.bind('dragenter', function(event) {
    				dragenterCallback({event: event});
					event.preventDefault();
				});

				element.bind('dragleave', function(event) {
					element.removeClass('dragover');
    				dragleaveCallback({event: event});
    				event.preventDefault();
				});

				element.bind('drop', function(event) {
					var files;
    				dropCallback({event: event});
    				// Jquery use originial Event
    				event = event.originalEvent || event || window.event;
					
					files = (event.files || event.dataTransfer.files);
					for (var i = 0; i < files.length; i++) {
						(function (i) {
				        		var reader = new FileReader();
				        		reader.onload = function (event) {
				        			scope.$apply(function() {
				        				scope.model = reader.result;
				        			})
				        		};
				        		reader.readAsText(files[i]);
				        	})(i);
				        // Work only with One file
				        break;
					}					
					element.removeClass('dragover');
    				event.preventDefault();
				});

			}
		};
	});