Template.inventory.helpers({
	'item_set_statuses': function() {
		return ['claimed', 'displayed', 'auctioned', 'repairing'];
	},

	'tag': function() {
		var claimed_tags = [];
		items.find({'owner': Meteor.userId(), 'status': "claimed"}).forEach(function(item_object) {
			for (var i=0; i<item_object.tags.length; i++) {
				if (claimed_tags.indexOf(item_object.tags[i]) == -1)
					claimed_tags.push(item_object.tags[i])
			}
		})

		return claimed_tags;
	}
});

Template.inventory.events({
	'click #display-by-tags': function() {
		var selected_tag = $('#selected-tag').val();
		if (selected_tag.length == 0)
			return false;

		Meteor.call('displayAllTagged', [selected_tag], function(error, result) {
			if (error) {
				console.log(error)
			}

			else {
				updateItemArray();
			}
		})
	},

	'change #selected-tag': function() {
		var selected_tag = $('#selected-tag').val();
		if (selected_tag.length == 0)
			return false;

		$('#search-area').val('#' + selected_tag);
		updateItemArray();
	},

	'click #clear-display': function() {
		Meteor.call('clearDisplay', function(error) {
			if (error) {
				console.log(error)
			}

			else {
				updateItemArray();
			}
		})
	}
})

Template.inventory.destroyed = function() {
	Session.set('inventory_page', undefined);
}
