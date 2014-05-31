'use strict';

angular.module('demo', ['aql.asciidoc', 'ui.ace', 'aql.directives.dropfile'])

// Define Opal attributes and options
.constant('asciidocOpts', Opal.hash2(['safe'], {'safe': 'unsafe'}))

.controller('demo', ['asciidocOpts', '$http', function(asciidocOpts, $http){
	var app = this;

	app.asciidocOpts = asciidocOpts;

	$http({method: 'GET', url: 'demo.adoc'}).
		success(function(data, status, headers, config) {
			app.ascii = data;
	  	});


	/**
	 * Define Post processor to change html generated with asciidoc
	 * @param  {angular.element} element [description]
	 * @return {html} html updated
	 */

	app.asciiPostProcessor = function(element) {

		element.find('a[href^="#"]').each(function() {
			var el = angular.element(this);
			el.on('click', function(){
				$location.hash(el.attr('href'));
      	$anchorScroll();
			});
		});
		return element;

	}

	// The ui-ace option
	app.aceOption = {
		theme:'terminal',
		mode: 'asciidoc'
	}



	app.onDragOver = function(event) {
		console.log(event);
	};

	app.onDragEnter = function(event) {
		console.log(event);
	};

	app.onDragLeave = function(event) {
		console.log(event);
	};

}]);
