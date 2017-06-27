Template.tagItemModal.helpers({
	'artwork_data': function(artwork_id) {
		return artworks.findOne(artwork_id);
	}
})

Template.tagItemModal.events({
	'click .ok-button' : function(element) {
		var item_id = $(element.target).data().item_id;
		var tag_array = commaSeparatedValuesToArray($('#tag-entry').val());

		Meteor.call('tagItem', item_id, tag_array, function(error) {
			if (error)
				console.log(error.message);

			else {
				updateItemArray();
			}
		});

		$('.template-modalTemplate').remove();
	},

	'keydown #tag-entry': function(event) {
		if (event.key == "Enter") {
			event.preventDefault();

			var item_id = $(event.target).data().item_id;
			var tag_array = commaSeparatedValuesToArray($('#tag-entry').val());

			Meteor.call('tagItem', item_id, tag_array, function(error) {
				if (error)
					console.log(error.message);

				else {
					updateItemArray();
				}
			});

			$('.template-modalTemplate').remove();
		}
	}, 
})