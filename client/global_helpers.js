Template.registerHelper('getItemObjectValue', function(item_object, value_type) {
	return getCommaSeparatedValue(getItemObjectValueByType(item_object, value_type, Meteor.userId()));
})

Template.registerHelper('consoleLogThis', function(the_thing) {
	console.log(the_thing);
	return true;
})

Template.registerHelper('getHTMLColorFromValue', function(value) {
	return getHTMLColorFromValue(value);
})

Template.registerHelper('getKnowledgeColorString', function(type) {
	var index = knowledge_types.indexOf(type);
	var base_r = 150;
	var base_g = 230;
	var multiplier = Math.pow(.8, knowledge_types.length - index -1);
	return "rgb(" + Math.floor(base_r * multiplier) + ", " + Math.floor(base_g * multiplier) + ", 0)";
})

Template.registerHelper('userIsAdmin', function() {
	return Meteor.user() && Meteor.user().profile.user_type == "admin";
})

Template.registerHelper('displayAsMoneyValue', function(value) {
	if (value < 0) {
		var string_value = getCommaSeparatedValue(value);
		var new_string = string_value.slice(0, 1) + "$" + string_value.slice(1);
		return new_string;
	}
	
	else return "$" + getCommaSeparatedValue(value);
})

Template.registerHelper('commaSeparatedValue', function(value) {
	return getCommaSeparatedValue(value);
})

Template.registerHelper('positionFromIndex', function(index) {
	return index + 1;
})

Template.registerHelper('isEqual', function(first, second) {
	return first == second;
})

Template.registerHelper('getImageURL', function(filename) {
	// return "img/uvtemplate.bmp";
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/full_images/" + filename;
})

Template.registerHelper('getCardImageURL', function(filename) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";

	var image_name = filename.substring(0, filename.indexOf("."));
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/card_images/" + image_name + "_card.jpg";
})

Template.registerHelper('getThumbImageURL', function(filename) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	var image_name = filename.substring(0, filename.indexOf("."));
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/thumbnail_images/" + image_name + "_thumb.jpg";
})

Template.registerHelper('getS3ImageURL', function(filename) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "http://s3.amazonaws.com/com.artfunkel.artwork/" + filename;
})

Template.registerHelper('getTextureURL', function(filename) {
	if (filename == undefined || filename == "undefined" || filename == "")
		return "";
	
	return "https://s3.amazonaws.com/com.artfunkel.artwork/textures/" + filename;
})

Template.registerHelper('floatToPercentage', function(value) {
	return Math.floor(value * 100);
})

//TODO collaps helpers into single object
Template.registerHelper('canUpgrade', function(item_id) {
	var permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_id));
	return permissions.canUpgrade();
})

Template.registerHelper('canAffordUpgrade', function(item_id) {
	var permissions = new PlayerItemPermissions(new PlayerIF(Meteor.user()), new ItemIF(item_id));
	return permissions.canAffordUpgrade();
})
