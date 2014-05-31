'use strict';

angular.module('demo', ['aql.directives.dropfile'])

.controller('DemoController', function(){
	var app = this;

	app.fileContent = "Initial content";

	app.onDragOver = function(event) {
		console.log(event);
	};

	app.onDragEnter = function(event) {
		console.log(event);
	};

	app.onDragLeave = function(event) {
		console.log(event);
	};

});