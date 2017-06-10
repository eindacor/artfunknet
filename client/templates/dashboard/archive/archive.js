Template.archive.helpers({
	'item_set_statuses': function() {
		return ['archived'];
	},

	'has_displaced': function() {
		return new PlayerIF(Meteor.user()).hasDisplacedItems();
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
	}
})