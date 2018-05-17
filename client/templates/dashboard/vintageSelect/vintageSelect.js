var blacklist_tracker = new Tracker.Dependency;
var blacklist = undefined;

Template.vintageSelect.rendered = function() {
	Session.set('selection_limit', Meteor.user().profile.vintage_count + 1)
	Meteor.call('getVintageItemIds', function(error, result) {
		if (error) {
			console.log(error);
		}
		else {
			setSelectedIds("vintage", result);
		}
	})
}

Template.vintageSelect.helpers({
	'item_set_statuses': function() {
		return ['claimed', 'displayed', 'auctioned'];
	},

	'blacklist': function() {
		blacklist_tracker.depend();
		if (blacklist == undefined) {
			Meteor.call('getVintageBlacklist', function(error, result) {
				if (error) {
					console.log(error)
				}
				else if (result != undefined) {
					blacklist = result;
					blacklist_tracker.changed();
				}
			})
		}
		
		return blacklist;		
	},

	'selection_data': function() {
		getSelectionTracker("vintage").depend();
		var selected_items = getSelectedIds("vintage");

		if (selected_items) {
			var selections_remaining = (Meteor.user().profile.vintage_count + 1) - selected_items.length;
			return {
				'none_remaining': selections_remaining <= 0,
				'selections_remaining': selections_remaining
			}
		}
		else return {
			'none_remaining': false,
			'selections_remaining': 0
		}
	}
});

Template.vintageSelect.events({
	'change #selected-tag': function() {
		var selected_tag = $('#selected-tag').val();
		if (selected_tag.length == 0)
			return false;

		$('#search-area').val('#' + selected_tag);
		updateItemArray();
	},

	'click #vintage-mode.enabled': function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "vintageModal", 
			'modal_data': undefined
		}, $('body')[0]);
	}
})