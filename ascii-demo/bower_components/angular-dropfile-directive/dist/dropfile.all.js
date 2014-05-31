/*!
 angular-dropfile-directive - v0.0.1 - 2014-03-02 

======================================= 
*/

function btoa(a){for(var b,c,d="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",e=[],f=0;f<a.length;)b=[a.charCodeAt(f++),a.charCodeAt(f++),a.charCodeAt(f++)],c=(b[0]<<16)+((b[1]||0)<<8)+(b[2]||0),e.push(d.charAt((c&63<<18)>>18),d.charAt((258048&c)>>12),d.charAt(isNaN(b[1])?64:(4032&c)>>6),d.charAt(isNaN(b[2])?64:63&c));return e.join("")}function atob(a){var c,e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",f=b=d=[],g=i=0;if(a.length%4!=0||new RegExp("[^"+e+"]").test(a)||/=/.test(a)&&(/=[^=]/.test(a)||/={3}/.test(a)))throw new Error("Invalid base64 data");for(;i<a.length;){for(g=i,f=[];g+4>i;i++)f.push(e.indexOf(a.charAt(i)));for(c=(f[0]<<18)+(f[1]<<12)+((63&f[2])<<6)+(63&f[3]),b=[(c&255<<16)>>16,64==f[2]?-1:(65280&c)>>8,64==f[3]?-1:255&c],g=0;3>g;g++)(b[g]>=0||0===g)&&d.push(String.fromCharCode(b[g]))}return d.join("")}window.Silverlight||(window.Silverlight={}),Silverlight._silverlightCount=0,Silverlight.__onSilverlightInstalledCalled=!1,Silverlight.fwlinkRoot="http://go2.microsoft.com/fwlink/?LinkID=",Silverlight.__installationEventFired=!1,Silverlight.onGetSilverlight=null,Silverlight.onSilverlightInstalled=function(){window.location.reload(!1)},Silverlight.isInstalled=function(a){void 0==a&&(a=null);var b=!1;try{var c=null,d=!1;if(window.ActiveXObject)try{c=new ActiveXObject("AgControl.AgControl"),null===a?b=!0:c.IsVersionSupported(a)&&(b=!0),c=null}catch(e){d=!0}else d=!0;if(d){var f=navigator.plugins["Silverlight Plug-In"];if(f)if(null===a)b=!0;else{var g=f.description;"1.0.30226.2"===g&&(g="2.0.30226.2");for(var h=g.split(".");h.length>3;)h.pop();for(;h.length<4;)h.push(0);for(var i=a.split(".");i.length>4;)i.pop();var j,k,l=0;do j=parseInt(i[l]),k=parseInt(h[l]),l++;while(l<i.length&&j===k);k>=j&&!isNaN(j)&&(b=!0)}}}catch(e){b=!1}return b},Silverlight.WaitForInstallCompletion=function(){if(!Silverlight.isBrowserRestartRequired&&Silverlight.onSilverlightInstalled){try{navigator.plugins.refresh()}catch(a){}Silverlight.isInstalled(null)&&!Silverlight.__onSilverlightInstalledCalled?(Silverlight.onSilverlightInstalled(),Silverlight.__onSilverlightInstalledCalled=!0):setTimeout(Silverlight.WaitForInstallCompletion,3e3)}},Silverlight.__startup=function(){if(navigator.plugins.refresh(),Silverlight.isBrowserRestartRequired=Silverlight.isInstalled(null),Silverlight.isBrowserRestartRequired){if(window.navigator.mimeTypes){var a=navigator.mimeTypes["application/x-silverlight-2"],b=navigator.mimeTypes["application/x-silverlight-2-b2"],c=navigator.mimeTypes["application/x-silverlight-2-b1"],d=c;b&&(d=b),a||!c&&!b?a&&d&&a.enabledPlugin&&d.enabledPlugin&&a.enabledPlugin.description!=d.enabledPlugin.description&&(Silverlight.__installationEventFired||(Silverlight.onRestartRequired(),Silverlight.__installationEventFired=!0)):Silverlight.__installationEventFired||(Silverlight.onUpgradeRequired(),Silverlight.__installationEventFired=!0)}}else Silverlight.WaitForInstallCompletion(),Silverlight.__installationEventFired||(Silverlight.onInstallRequired(),Silverlight.__installationEventFired=!0);Silverlight.disableAutoStartup||(window.removeEventListener?window.removeEventListener("load",Silverlight.__startup,!1):window.detachEvent("onload",Silverlight.__startup))},Silverlight.disableAutoStartup||(window.addEventListener?window.addEventListener("load",Silverlight.__startup,!1):window.attachEvent("onload",Silverlight.__startup)),Silverlight.createObject=function(a,b,c,d,e,f,g){var h={},i=d,j=e;if(h.version=i.version,i.source=a,h.alt=i.alt,f&&(i.initParams=f),i.isWindowless&&!i.windowless&&(i.windowless=i.isWindowless),i.framerate&&!i.maxFramerate&&(i.maxFramerate=i.framerate),c&&!i.id&&(i.id=c),delete i.ignoreBrowserVer,delete i.inplaceInstallPrompt,delete i.version,delete i.isWindowless,delete i.framerate,delete i.data,delete i.src,delete i.alt,Silverlight.isInstalled(h.version)){for(var k in j)if(j[k]){if("onLoad"==k&&"function"==typeof j[k]&&1!=j[k].length){var l=j[k];j[k]=function(a){return l(document.getElementById(c),g,a)}}var m=Silverlight.__getHandlerName(j[k]);if(null==m)throw"typeof events."+k+" must be 'function' or 'string'";i[k]=m,j[k]=null}slPluginHTML=Silverlight.buildHTML(i)}else slPluginHTML=Silverlight.buildPromptHTML(h);return b?void(b.innerHTML=slPluginHTML):slPluginHTML},Silverlight.buildHTML=function(a){var b=[];b.push('<object type="application/x-silverlight" data="data:application/x-silverlight,"'),null!=a.id&&b.push(' id="'+Silverlight.HtmlAttributeEncode(a.id)+'"'),null!=a.width&&b.push(' width="'+a.width+'"'),null!=a.height&&b.push(' height="'+a.height+'"'),b.push(" >"),delete a.id,delete a.width,delete a.height;for(var c in a)a[c]&&b.push('<param name="'+Silverlight.HtmlAttributeEncode(c)+'" value="'+Silverlight.HtmlAttributeEncode(a[c])+'" />');return b.push("</object>"),b.join("")},Silverlight.createObjectEx=function(a){var b=a,c=Silverlight.createObject(b.source,b.parentElement,b.id,b.properties,b.events,b.initParams,b.context);return null==b.parentElement?c:void 0},Silverlight.buildPromptHTML=function(a){var b="",c=Silverlight.fwlinkRoot,d=a.version;return a.alt?b=a.alt:(d||(d=""),b="<a href='javascript:Silverlight.getSilverlight(\"{1}\");' style='text-decoration: none;'><img src='{2}' alt='Get Microsoft Silverlight' style='border-style: none'/></a>",b=b.replace("{1}",d),b=b.replace("{2}",c+"108181")),b},Silverlight.getSilverlight=function(a){Silverlight.onGetSilverlight&&Silverlight.onGetSilverlight();var b="",c=String(a).split(".");if(c.length>1){var d=parseInt(c[0]);b=isNaN(d)||2>d?"1.0":c[0]+"."+c[1]}var e="";b.match(/^\d+\056\d+$/)&&(e="&v="+b),Silverlight.followFWLink("149156"+e)},Silverlight.followFWLink=function(a){top.location=Silverlight.fwlinkRoot+String(a)},Silverlight.HtmlAttributeEncode=function(a){var b,c="";if(null==a)return null;for(var d=0;d<a.length;d++)b=a.charCodeAt(d),b>96&&123>b||b>64&&91>b||b>43&&58>b&&47!=b||95==b?c+=String.fromCharCode(b):c=c+"&#"+b+";";return c},Silverlight.default_error_handler=function(a,b){var c,d=b.ErrorType;c=b.ErrorCode;var e="\nSilverlight error message     \n";e+="ErrorCode: "+c+"\n",e+="ErrorType: "+d+"       \n",e+="Message: "+b.ErrorMessage+"     \n","ParserError"==d?(e+="XamlFile: "+b.xamlFile+"     \n",e+="Line: "+b.lineNumber+"     \n",e+="Position: "+b.charPosition+"     \n"):"RuntimeError"==d&&(0!=b.lineNumber&&(e+="Line: "+b.lineNumber+"     \n",e+="Position: "+b.charPosition+"     \n"),e+="MethodName: "+b.methodName+"     \n"),alert(e)},Silverlight.__cleanup=function(){for(var a=Silverlight._silverlightCount-1;a>=0;a--)window["__slEvent"+a]=null;Silverlight._silverlightCount=0,window.removeEventListener?window.removeEventListener("unload",Silverlight.__cleanup,!1):window.detachEvent("onunload",Silverlight.__cleanup)},Silverlight.__getHandlerName=function(a){var b="";if("string"==typeof a)b=a;else if("function"==typeof a){0==Silverlight._silverlightCount&&(window.addEventListener?window.addEventListener("unload",Silverlight.__cleanup,!1):window.attachEvent("onunload",Silverlight.__cleanup));var c=Silverlight._silverlightCount++;b="__slEvent"+c,window[b]=a}else b=null;return b},Silverlight.onRequiredVersionAvailable=function(){},Silverlight.onRestartRequired=function(){},Silverlight.onUpgradeRequired=function(){},Silverlight.onInstallRequired=function(){},Silverlight.IsVersionAvailableOnError=function(a,b){var c=!1;try{8001!=b.ErrorCode||Silverlight.__installationEventFired?8002!=b.ErrorCode||Silverlight.__installationEventFired?5014==b.ErrorCode||2106==b.ErrorCode?Silverlight.__verifySilverlight2UpgradeSuccess(b.getHost())&&(c=!0):c=!0:(Silverlight.onRestartRequired(),Silverlight.__installationEventFired=!0):(Silverlight.onUpgradeRequired(),Silverlight.__installationEventFired=!0)}catch(d){}return c},Silverlight.IsVersionAvailableOnLoad=function(a){var b=!1;try{Silverlight.__verifySilverlight2UpgradeSuccess(a.getHost())&&(b=!0)}catch(c){}return b},Silverlight.__verifySilverlight2UpgradeSuccess=function(a){var b=!1,c="4.0.50401",d=null;try{a.IsVersionSupported(c+".99")?(d=Silverlight.onRequiredVersionAvailable,b=!0):d=a.IsVersionSupported(c+".0")?Silverlight.onRestartRequired:Silverlight.onUpgradeRequired,d&&!Silverlight.__installationEventFired&&(d(),Silverlight.__installationEventFired=!0)}catch(e){}return b},function(){function a(){c.style.left=c.style.top="-1000px"}function b(a,b,c){a.addEventListener?(a.removeEventListener(b,c,!1),a.addEventListener(b,c,!1)):(a.detachEvent("on"+b,c),a.attachEvent("on"+b,c))}if(window.dropfile=!0,!("FileReader"in window)){if(!Silverlight.isInstalled())return void(window.dropfile=!1);var c,d,e=function(){var a=document.getElementsByTagName("script"),b=a[a.length-1];return((b.src?b.src:b.getAttribute("src")).match(/(.*\/)/)||[""])[0]}(),f=function(){return document.getElementsByTagName("body").length?(c=document.createElement("div"),Silverlight.createObjectEx({source:e+"dropfile.xap",parentElement:c,id:"SilverlightControl",properties:{width:"100%",height:"100%",version:"2.0",background:"#FFFFFF"}}),c.style.display="block",c.id="SilverlightContainer",c.style.position="fixed",c.style.width=c.style.height="80px",document.getElementsByTagName("body")[0].appendChild(c),a(),b(document.body||document,"dragenter",function(a){a=a||window.event;var e=a.target||a.srcElement;if("SilverlightControl"!==e.id&&"SilverlightContainer"!==e.id)return d=e,b(d,"dragover",function(a){a=a||window.event,"pageX"in a||(a.pageX=a.clientX,a.pageY=a.clientY),c.style.top=a.pageY-5+"px",c.style.left=a.pageX-5+"px"}),!1}),!0):!1};f()||b(window,"load",f),window.dropfile=function(){a(!0);for(var b={files:[]},c=0;c<arguments.length;c++){var e=arguments[c].split(",")[0],f=arguments[c].split(",")[1],g={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif"}[e.toLowerCase().match(/[^\.]*$/)[0]]||"";b.files[c]={name:e,size:f.length,data:f,type:g}}if(d.dispatchEvent)try{var h=document.createEvent("DragEvent");h.files=b.files,h.initDragEvent("drop",!0,!0,window,0,0,0,0,0,!1,!1,!1,!1,0,null,b),d.dispatchEvent(h)}catch(i){throw"Whoops could not trigger the drop event"}else if(d.fireEvent)try{var h=document.createEventObject();h.files=b.files,d.fireEvent("ondrop",h)}catch(i){throw"Whoops could not trigger the drop event"}},window.FileReader=function(){this.onload,this.result,this.readAsDataURL=function(a){this.read("data:"+a.type+";base64,"+a.data)},this.readAsBinaryString=function(a){this.read(atob(a.data))},this.readAsText=function(a){this.read(atob(a.data))},this.readAsArrayBuffer=function(){throw"Whoops FileReader.readAsArrayBuffer is unimplemented"},this.read=function(a){if(this.result=a,!this.onload)throw"Please define the onload event handler first";this.onload({target:{result:a}})}}}}(),window.getComputedStyle||(window.getComputedStyle=function(a){return this.el=a,this.getPropertyValue=function(b){var c=/(\-([a-z]){1})/g;return"float"==b&&(b="styleFloat"),c.test(b)&&(b=b.replace(c,function(){return arguments[2].toUpperCase()})),a.currentStyle[b]?a.currentStyle[b]:null},this});
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