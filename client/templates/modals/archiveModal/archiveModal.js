var category;
var replaced_item_tracker = new Tracker.Dependency;

Template.archiveModal.events({
	'click #archive-item' : function(element) {
		var item_id = $(element.target).data().item_id;
		Meteor.call('archiveItem', item_id, category, function(error) {
			if (error)
				console.log(error.message);

			else {
				$('.template-modalTemplate').remove();
				updatePages();
			}
		});
	}

})

Template.archiveModal.helpers({
	'category': function(item_data) {
		var item_interface = new ItemIF(item_data);
		return item_interface.getArchiveCategories();
	},

	'displaced_item': function(item_data) {
		var player_item_interface = new PlayerItemIF(new PlayerIF(Meteor.user()), new ItemIF(item_data));
		displaced_item = player_item_interface.getDisplacedArchiveItem();
		if (displaced_item) {
			displaced_item.displaced = true;
		}
		return displaced_item;
	}
})

Template.archiveModal.rendered = function() {
	replaced_item_tracker.changed();
}