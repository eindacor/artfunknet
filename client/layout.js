/**
This helper is used by the meteorValue template to create a unique span whose content will be filled by the result of the supplied meteor call.
The meteor call cannot take any arguments, and should return a plain value. 

This is a space-saving tool that the meteorValue template uses to display one-off values.
*/
Template.meteorValue.helpers({
	'displayValueFromMeteor' : function(meteorCall) {
		var identifier = meteorCall + "-" + Math.random().toString(36).substring(7);
		// console.log(identifier);
		Meteor.call(meteorCall, function(error, result) {
			if(error) {
				$("#"+identifier).innerHTML("<i class=\"nav-icon fa fa-clock-o\">");
			} else{
				$("#"+identifier).text(result);
			}
		});

		return identifier;
	}
})