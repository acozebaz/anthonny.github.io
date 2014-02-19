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

	// The ui-ace option
	app.aceOption = {
		theme:'terminal',
		mode: 'asciidoc'
	}
}]);