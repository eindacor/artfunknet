Template.wiki.helpers({
	'unique_attribute': function() {
		return unique_attributes.find({'active': true});
	},

	'attribute': function() {
		return attributes.find({'active': true});
	},

	'intersection': function(row_attribute) {
		var all_attributes = attributes.find({'active': true}).fetch();
		var intersections = [];
		for (var i=0; i<all_attributes.length; i++) {
			var column_attribute = all_attributes[i];
			if (column_attribute._id == row_attribute._id) {
				intersections.push({
					'flavor_text': undefined,
					'title': undefined,
					'description': undefined,
					'is_null': true
				});
			}

			else intersections.push(unique_attributes.findOne({'linked_attributes': {$all: [column_attribute._id, row_attribute._id]}}));
		}
		return intersections;
	}
})