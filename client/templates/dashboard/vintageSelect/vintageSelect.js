var blacklist_tracker = new Tracker.Dependency;
var blacklist = undefined;

Template.vintageSelect.rendered = function() {
	Session.set('selection_limit', Meteor.user().profile.vintage_count + 1)
	Meteor.call('getVintageItemIds', function(error, result) {
		if (error) {
			console.log(error);
		}
		else {
			Session.set('selected_items', result);
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

	'click #vintage-mode': function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "vintageModal", 
			'modal_data': undefined
		}, $('body')[0]);
	}
})