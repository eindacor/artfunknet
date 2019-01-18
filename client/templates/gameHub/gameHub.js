var seasonal_stub_tracker = new Tracker.Dependency;

var seasonal_stubs = undefined;

Template.gameHub.helpers({
	'lottery_item_id': function() {
		return metadata.findOne({'lottery_draw': {$ne: null}}).rewards;
	},

	'seasonal_stub': function() {
		seasonal_stub_tracker.depend();

		if (seasonal_stubs === undefined) {
			Meteor.call('getSeasonalStubs', function(error, result) {
				if (error) {
					console.log(error);
				}
				else {
					seasonal_stubs = result;
					seasonal_stub_tracker.changed();
				}
			})
		}

		return seasonal_stubs;
	}
})

Template.seasonalRefresh.helpers({
	'next_rotation': function(rarity) {
		var next_rotation = metadata.findOne({'loot_data': {$ne: null}}).loot_data.seasonal_rotation[rarity];
		return moment(next_rotation).format('MM-DD-YYYY');
	}
})