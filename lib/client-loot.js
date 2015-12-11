crate_qualities = ["bronze", "silver", "gold", "platinum", "diamond"];
artwork_rarities = ["common", "uncommon", "rare", "legendary", "masterpiece"];

procUniqueAttribute = function(user_id, unique_code) {
    //TODO replace logic with DB tracking of artworks or items with unique attributes
    var unique_attribute_object = unique_attributes.findOne({'code': unique_code, 'active': true});
    if (unique_attribute_object == undefined)
        return false;

    var artworks_found = artworks.find({'locked_attributes': {$all: unique_attribute_object.linked_attributes}}).fetch();

    for (var i=0; i<artworks_found.length; i++) {
        if (items.findOne({'owner': user_id, 'artwork_id': artworks_found[i]._id, 'status': "displayed"}))
            return true;
    }

    return false;
}