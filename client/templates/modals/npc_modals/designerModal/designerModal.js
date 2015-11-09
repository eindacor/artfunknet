Template.designerModal.helpers({
	'interactionData' : function() {
		return Session.get('npc_interaction');
	}
})

Template.designerModal.events({
	'click #close-button' : function() {
		Modal.hide('designerModal');
	}
})