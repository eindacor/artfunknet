Template.historianModal.helpers({
	'interactionData' : function() {
		return Session.get('npc_interaction');
	},

	'quest_target' : function(quest_object) {
		var target_info = [];
		for (var i=0; i<quest_object.target.length; i++)
			target_info.push(artworks.findOne(quest_object.target[i]));

		return target_info;
	},

	'acquired' : function(artwork_id) {
		return items.findOne({'artwork_id': artwork_id, 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'auctioned']}}) != undefined
	},
})

Template.historianModal.events({
	'click #close-button' : function() {
		Modal.hide('historianModal');
	}
})