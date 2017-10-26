Template.quests.helpers({
	'quest' : function() {
		return quests.find({'owner_id': Meteor.userId()});
	},
	'activeQuests': function() {
		return quests.find({'owner_id': Meteor.userId()}).count();
	}
})

Template.questTemplate.helpers({
	'quest_stub': function(artwork_object) {
		var item_data = {
			'artwork_id': artwork_object._id,
			'artwork_data': artwork_object,
			'level': 1
		}

		return item_data;
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