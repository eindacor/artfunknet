var html_message_set = false;
var html_message_tracker = new Tracker.Dependency;

Template.standardNPCMessageModal.helpers({
	'message' : function() {
		var npc_interaction = Session.get('npc_interaction');
		if (npc_interaction == undefined)
			return "";

		else return npc_interaction.message;
	},

	'setMessage': function(html) {
		html_message_tracker.depend();
		if ($('.modal-message').length > 0 && !html_message_set) {
			$('.modal-message').append(html);
			html_message_set = true;
		}
	}
})

Template.standardNPCMessageModal.events({
	'click #ok-modal': function(){
    	Session.set('npc_interaction', undefined);
        Modal.hide('standardNPCMessageModal');
    }
})

Template.standardNPCMessageModal.rendered = function() {
	html_message_set = false;
	html_message_tracker.changed();
}