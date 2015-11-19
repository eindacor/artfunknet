Template.historianModal.helpers({
	'interactionData' : function() {
		return Session.get('npc_interaction');
	}
})

Template.historianModal.events({
	'click #close-button' : function() {
		Modal.hide('historianModal');
	}
})