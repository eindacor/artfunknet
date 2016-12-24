Template.inventory.helpers({
	'item_set_statuses': function() {
		return ['claimed', 'displayed', 'permanent', 'auctioned'];
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

		Meteor.call('displayAllTagged', [selected_tag], $('#tagged-display-duration').val(), function(error, result) {
			if (error)
				console.log(error.message)

			if (result.length > 0) {
				//show errors in UI
			}

			Session.set('update_set', true);
		})
	}
})

Template.inventory.destroyed = function() {
	Session.set('inventory_page', undefined);
}
