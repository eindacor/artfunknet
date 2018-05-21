Template.gameHub.helpers({
	'seasonal_item_object': function(seasonal_ids) {
		var loot_data = metadata.findOne({'loot_data': {$ne: null}}).loot_data;

		var seasonal_item_objects = [];
		for (var i=0; i<seasonal_ids.length; i++) {
			var artwork_id = seasonal_ids[i];
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

Template.seasonalRefresh.helpers({
	'next_rotation': function(rarity) {
		var next_rotation = metadata.findOne({'loot_data': {$ne: null}}).loot_data.seasonal_rotation[rarity];
		return moment(next_rotation).format('MM-DD-YYYY');
	}
})