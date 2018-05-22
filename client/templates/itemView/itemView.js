var item_data_tracker = new Tracker.Dependency;

var item_data = undefined;

Template.itemView.helpers({
	'item_data': function(item_id) {
		item_data_tracker.depend();
		if (item_data == undefined) {
			Meteor.call('getItemData', item_id, function(error, result) {
				if (error) {
					console.log(error);
				}
				else if (result) {
					item_data = result;
					item_data_tracker.changed();
				}
			})
		}

		return item_data;
	}
})