Template.galleryItemInfo.helpers({
	'itemData' : function(item_id) {
		var item_object = items.findOne(item_id);
		if (item_object != undefined) {
			
			var item_data_object = {
				'title' : item_object.artwork_data.title,
				'date' : item_object.artwork_data.date,
				'artist' : item_object.artwork_data.artist,
				'rarity' : item_object.artwork_data.rarity,
				'medium' : item_object.artwork_data.medium,
				'width' : item_object.artwork_data.width,
				'height' : item_object.artwork_data.height,
				'condition_text' : Math.floor(item_object.condition * 100) + '%',
				'condition' : item_object.condition,
				'attribute' : item_object.attributes,
				'item_id' : item_object._id,
				'xp_rating' : item_object.xp_rating,
				'xp_rating_text' : Math.floor(item_object.xp_rating * 100),
				'is_not_permanent' : item_object.status != "permanent"
			}

			return item_data_object;
		}

		else {
			return {
				'title' : "",
				'date' : "",
				'artist' : "",
				'rarity' : "",
				'medium' : "",
				'width' : "",
				'height' : "",
				'condition_text' : "",
				'condition' : "",
				'attribute' : "",
				'item_id' : "",
				'xp_rating' : "",
				'xp_rating_text' : "",
				'is_not_permanent' : ""
			}
		}
	}
})

Template.galleryItemThumbnail.helpers({
	'imageInfo' : function(item_id) {
		try {
			var item_object = items.findOne(item_id);

			var overall_dimension = 210;
			var max_dimension = 200;

			var width = item_object.artwork_data.width;
			var height = item_object.artwork_data.height;
			var ratio = width / height;

			var info_object = {
				'item_id' : item_id,
				'image_width' : 0,
				'image_height' : 0,
				'filename' : item_object.artwork_data.filename,
			};

			if (width > height) {
				info_object.image_width = max_dimension;
				info_object.image_height = Math.floor(max_dimension / ratio);
			}

			else {
				info_object.image_height = max_dimension;
				info_object.image_width = Math.floor(max_dimension * ratio);
			}

			info_object.padding_top = Math.floor((overall_dimension - info_object.image_height) / 2);

			return info_object;
		}

		catch(error) {
			return {
				'item_id' : "",
				'image_width' : 0,
				'image_height' : 0,
				'imageURL' : "",
				'padding_top' : 0,
			};
		}
	}
})

Template.galleryItemThumbnail.events({
	'click .image-thumb' : function(element) {
		var item_id = $(element.target).data('item_id');
		Session.set('selectedItem', item_id);
		Modal.show('fullViewModal');
	}
})

Template.galleryItemInfo.events({
	'mouseover .item-attribute' : function(element) {
		var attribute_id = element.target.dataset.attribute_id;
		var value = Math.floor(Number(element.target.dataset.attribute_value) * 100);
		var description = element.target.dataset.attribute_description;
		var hover_string = "level " + value + " " + description;
		setFootnote(hover_string, Math.floor(Math.random() * 1000));
	}
})