Template.purchaseModal.helpers({
	'item_data' : function() {
		if (Session.get('selectedItem')) {
			return items.findOne(Session.get('selectedItem'));
		}

		else return {
			'title' : "",
			'artist' : "",
		}
	},

	'imageInfo' : function(item_id) {
		try {
			var item_object = items.findOne(item_id);

			var max_dimension = 400;

			var width = item_object.artwork_data.width;
			var height = item_object.artwork_data.height;
			var ratio = width / height;

			var info_object = {
				'image_width' : 0,
				'image_height' : 0,
				'filename' : item_object.artwork_data.filename
			};

			if (width > height) {
				info_object.image_width = max_dimension;
				info_object.image_height = Math.floor(max_dimension / ratio);
			}

			else {
				info_object.image_height = max_dimension;
				info_object.image_width = Math.floor(max_dimension * ratio);
			}

			return info_object;
		}

		catch(error) {
			return {
				'image_width' : 0,
				'image_height' : 0,
				'filename' : ""
			};
		}
	},
})

Template.purchaseModal.events({
	'click #close-button' : function() {
		Modal.hide('purchaseModal');
	},

	'click #purchase-artwork' : function() {
		if (Session.get('selectedItem')) {
			Meteor.call('purchaseItemFromDealer', Session.get('selectedItem'), function(error) {
				if (error)
					console.log(error.message);

				else {
					Modal.hide('purchaseModal');
					updateItemArray();
				}
			});
		}
	}
})