var quest_targets_tracker = new Tracker.Dependency;
var quest_targets_owned;

Template.quests.helpers({
	'quest' : function() {
		return quests.find({'owner_id': Meteor.userId()});
	},
	'activeQuests': function() {
		return quests.find({'owner_id': Meteor.userId()}).count();
	}
})

Template.quests.rendered = function() {
	quest_targets_owned = undefined;
}

Template.questTemplate.helpers({
	'acquired' : function(artwork_id) {
		return items.findOne({'artwork_id': artwork_id, 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'auctioned', 'won', 'archived']}}) != undefined
	},

	'quest_target' : function(quest_object) {
		quest_targets_tracker.depend();

		if (quest_targets_owned == undefined) {
			Meteor.call('getQuestTargetsOwned', function(error, result) {
				if (error) {
					console.log(error);
				}
				else {
					quest_targets_owned = result;
					quest_targets_tracker.changed();
				}
			})
		}

		else {
			var target_info = [];
			var player_interface = new PlayerIF(Meteor.user());
			for (var i=0; i<quest_object.target.length; i++) {
				var artwork_id = quest_object.target[i];
				target_info.push({
					'artwork_object': artworks.findOne(artwork_id),
					'owned_item': quest_targets_owned[artwork_id]
				});
			}

			return target_info;
		}	
	},

	'quest_stub': function(artwork_object) {
		var item_data = {
			'artwork_id': artwork_object._id,
			'artwork_data': artwork_object,
			'level': 1
		}

		return item_data;
	},

	'hasCompleted' : function(quest_id) {
		var quest_object = quests.findOne(quest_id)

		var targets_found = 0;
		for (var i=0; i < quest_object.target.length; i++) {
			if (items.findOne({'artwork_id': quest_object.target[i], 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won', 'archived']}}) != undefined)
				targets_found++;
		}

		return targets_found >= quest_object.min_requirement;
	},

	'artwork_rarity' : function(artwork_id) {
		return artworks.findOne(artwork_id).rarity;
	}
})

Template.questTemplate.events({
	'click .turn-in-button.enabled' : function(element) {
		Meteor.call('turnInQuest', $(element.target).data().quest_id, false, false, function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click .cancel-quest' : function(element) {
		Meteor.call('cancelQuest', $(element.target).data().quest_id, function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click .turn-in-and-sell.enabled' : function(element) {
		Meteor.call('turnInQuest', $(element.target).data().quest_id, true, false, function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click .turn-in-and-donate.enabled' : function(element) {
		Meteor.call('turnInQuest', $(element.target).data().quest_id, false, true, function(error) {
			if (error)
				console.log(error.message);
		})
	}
})