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
	},

	'change .category-selector' : function() {
    	category = $('.category-selector').val();
		replaced_item_tracker.changed();
    },

    'click .category-unselected': function(element) {
    	category = $(element.target).data().category;
    	replaced_item_tracker.changed();
    }

})

Template.archiveModal.helpers({
	'category': function(item_data) {
		var item_interface = new ItemIF(item_data);
		return item_interface.getArchiveCategories();
	},

	'replaced_item': function(item_data) {
		replaced_item_tracker.depend();
		var item_interface = new ItemIF(item_data);
		if (category == undefined) {
			category = item_interface.getArchiveCategories()[0];
			replaced_item_tracker.changed();
		}

		else {
			var displaced_item = new PlayerItemIF(new PlayerIF(Meteor.userId()), item_interface).getDisplacedArchiveItem(category);
			displaced_item.archive_category = undefined;
			return displaced_item;
		}
	},

	'selected_category': function() {
		replaced_item_tracker.depend();
		return category;
	}
})

Template.archiveModal.rendered = function() {
	category = undefined;
	replaced_item_tracker.changed();
}