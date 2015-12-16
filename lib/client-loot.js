crate_qualities = ["bronze", "silver", "gold", "platinum", "diamond"];
artwork_rarities = ["common", "uncommon", "rare", "legendary", "masterpiece"];

procUniqueAttribute = function(user_id, unique_code, required_npc_name) {
    if (required_npc_name && npcs.findOne({'owner_id': Meteor.userId(), 'attribute_id': attributes.findOne({'npc_name': required_npc_name})._id}) == undefined)
        return false;

    //TODO replace logic with DB tracking of artworks or items with unique attributes
    var unique_attribute_object = unique_attributes.findOne({'code': unique_code, 'active': true});
    if (unique_attribute_object == undefined)
        return false;

    var artworks_found = artworks.find({'locked_attributes': {$all: unique_attribute_object.linked_attributes}}).fetch();

    for (var i=0; i<artworks_found.length; i++) {
    	var item_object = items.findOne({'owner': user_id, 'artwork_id': artworks_found[i]._id, 'status': "displayed"});
        if (item_object)
            return item_object;
    }

    return false;
}