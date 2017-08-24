var artist_view = true;
var archive_mode_tracker = new Tracker.Dependency;

Template.archive.helpers({
	'item_set_statuses': function() {
		return ['archived'];
	},
	
	'artist_view': function() {
		archive_mode_tracker.depend();
		return artist_view;
	}
});

Template.archive.events({
	'click #show-displaced': function() {
		$('#search-area').val("#displaced");
		refreshItemSet();
	},

	'click #delete-all-displaced': function() {
		Blaze.renderWithData(Template.modalTemplate, {
			'modal_name': "deleteAllDisplacedModal", 
			'modal_data': {}
		}, $('body')[0]);
	},

	'click .archive-mode-button': function() {
		artist_view = !artist_view;
		archive_mode_tracker.changed();
	}
})