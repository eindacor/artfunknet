Template.gameHub.helpers({
	'seasonal_item_object': function() {
		var seasonal_items = metadata.findOne({'loot_data': {$ne: null}}).loot_data.seasonal_items;

		var seasonal_item_objects = [];
		for (var i=0; i<seasonal_items.length; i++) {
			var artwork_id = seasonal_items[i];
			var item_data = {
				'artwork_id': artwork_id,
				'artwork_data': artworks.findOne(artwork_id),
				'seasonal': true, 
				'level': 1
			}
			seasonal_item_objects.push(item_data);
		}

		return seasonal_item_objects;
	},

	'lottery_item_id': function() {
		return metadata.findOne({'lottery_draw': {$ne: null}}).rewards;
	}
})