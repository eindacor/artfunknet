Template.quests.helpers({
	'quest' : function() {
		return quests.find({'owner_id': Meteor.userId()});
	}
})

Template.questTemplate.helpers({
	'acquired' : function(artwork_id) {
		return items.findOne({'artwork_id': artwork_id, 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'auctioned']}}) != undefined
	},

	'quest_target' : function(quest_object) {
		var target_info = [];
		for (var i=0; i<quest_object.target.length; i++)
			target_info.push(artworks.findOne(quest_object.target[i]));

		return target_info;
	},

	'hasCompleted' : function(quest_id) {
		var target = quests.findOne(quest_id).target;

		for (var i=0; i<target.length; i++) {
			if (items.findOne({'artwork_id': target[i], 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale']}}) == undefined)
				return false;
		}

		return true;
	},

	'artwork_rarity' : function(artwork_id) {
		return artworks.findOne(artwork_id).rarity;
	}
})

Template.questTemplate.events({
	'click .turn-in-button.enabled' : function(element) {
		Meteor.call('turnInQuest', $(element.target).data().quest_id, function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click .cancel-quest' : function(element) {
		Meteor.call('cancelQuest', $(element.target).data().quest_id, function(error) {
			if (error)
				console.log(error.message);
		})
	}
})