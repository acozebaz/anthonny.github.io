'use strict';

angular.module('demo', ['aql.asciidoc', 'ui.ace'])

// Define Opal attributes and options
.constant('asciidocOpts', Opal.hash2(['options'], {'header_footer': true}))

.controller('demo', ['asciidocOpts', '$http', function(asciidocOpts, $http){
	var app = this;

	$http({method: 'GET', url: 'demo.asciidoc'}).
		success(function(data, status, headers, config) {
			app.ascii = data;
	  	});


	app.asciidocOpts = asciidocOpts;

	/**
	 * Define postProcessor to change html generated with asciidoc
	 * @param  {angular.element} element [description]
	 * @return {html} html updated
	 */
	var urlImages = 'https://raw.github.com/asciidoctor/asciidoctor.js/master/examples/';
	var urlLink = 'https://github.com/opendevise/asciidoc-samples/blob/master/';

	app.asciiPostProcessor = function(element) {
		element.find('a').not('[href^="http"]').not('[href^="#"]').each(function() {
			var el = angular.element(this)
			var href = el.attr('href');
			el.attr('href', urlLink+href)
		});

		element.find('a[href^="#"]').each(function() {
			var el = angular.element(this);
			el.on('click', function(){
				$location.hash(el.attr('href'));
      	$anchorScroll();
			});
		});

		element.find('img').not('[src^="http"]').each(function() {
			var el = angular.element(this);
			var srcImg = el.attr('src');
			el.attr('src',  urlImages+srcImg);
		});

		return element;
	}

	// The ui-ace option
	app.aceOption = {
		theme:'terminal',
		mode: 'asciidoc'
	}
}]);