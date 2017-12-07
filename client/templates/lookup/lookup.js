var legendaryLookupTracker = new Tracker.Dependency;
var choiceTracker = new Tracker.Dependency;

var legendaries_found = artworks.find({'rarity': {$in: ["masterpiece", "legendary"]}}).fetch();

var updateLegendaryLookup = function(first, second) {
	if (first == "any" && second == "any")
		legendaries_found = artworks.find({'rarity': {$in: ["masterpiece", "legendary"]}}).fetch();

	else if (first == "any")
		legendaries_found = artworks.find({'special_attributes': {$in: [second]}}).fetch();

	else if (second == "any")
		legendaries_found = artworks.find({'special_attributes': {$in: [first]}}).fetch();

	else legendaries_found = artworks.find({$and: [{'special_attributes': {$in: [first]}}, {'special_attributes': {$in: [second]}}]}).fetch();

	legendaryLookupTracker.changed();
}

Template.lookup.events({
	'change .attribute-selector' : function() {
    	updateLegendaryLookup($('#attribute-selector-one').val(), $('#attribute-selector-two').val())
    	choiceTracker.changed();
    }
})

Template.lookup.helpers({
	'selectorOneChoice' : function() {
		choiceTracker.depend();
		return attributes.find({'_id': {$ne: $('#attribute-selector-two').val()}, 'active': true});
	},

	'selectorTwoChoice' : function() {
		choiceTracker.depend();
		return attributes.find({'_id': {$ne: $('#attribute-selector-one').val()}, 'active': true});
	},

	'artwork_found' : function() {
		legendaryLookupTracker.depend();
		return legendaries_found;
	}
})

Template.lookup.rendered = function() {
	updateLegendaryLookup("any", "any");
}