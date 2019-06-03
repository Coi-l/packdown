;(function(root) {
'use strict';

const tableStyle = "\
table.packdown {\
  width: 100%;\
  text-align: center;\
  border-collapse: collapse;\
}\
\
table.packdown td, table.packdown th {\
  border: 1px solid #000000;\
}\
"

function packdown() {
};

/***
 * Since javascript workers cant create their own elements...
 */
function TextNode(text) {
    this.text = text;
};

TextNode.prototype.getHTML = function() {
    return this.text;
};

function Element(tag) {
    this.tag = tag;
    this.attributes = new Map();
    this.children = [];
};

Element.prototype.setAttribute = function(attr, val) {
    this.attributes.set(attr, val);
};

Element.prototype.appendChild = function(element) {
    this.children.push(element);
};

Element.prototype.getHTML = function() {
    var str = "<" + this.tag;
    for (var [attr, value] of this.attributes) {
        str += " " + attr + "='" + value + "'";
    }
    str += ">";
    for (var child of this.children) {
        str += child.getHTML();
    }
    str += "</" + this.tag + ">";
    return str;
};

/***
 * Packet table renderer
 */
function Field(description, bits) {
    this.description = description;
    this.bits = bits;
    this.bitsLeft = bits;
    this.element = null;
    this.rowspan = false;
    this.numRowspan = 1;
};

Field.prototype.consume = function(bitsToConsume) {
    var consumed = 0;
    if (this.bitsLeft <= bitsToConsume) {
        consumed = this.bitsLeft;
        this.bitsLeft = 0;
    } else {
        consumed = bitsToConsume;
        this.bitsLeft -= consumed;
    }

    return consumed;
};

/***
 * Factory method for Field
 */
Field.fromString = function(str) {
    var s = str.trim();
    var split = /^(\d*)(b|B):?(S)?\s*(.*)$/;
    var parts = split.exec(s);
    if (parts == null) {
        return null;
    }
    //Assume bits for size, check if bytes
    var bits = parseInt(parts[1]);
    if (parts[2] == 'B') {
        bits = bits * 8;
    }
    var f = new Field(parts[4], bits)
    if (parts[3] == 'S') {
        f.rowspan = true;
    }
    return f;
};


function Row(bitsLeft) {
    this.element = [];
    this.octetHeader = null;
    this.bitHeader = null;
    this.bitsLeft = bitsLeft;
}

packdown.fillRowsWithFields = function(row, rows, field, fields) {
    if (field == null) {
        field = fields.shift();
        if (field == null) {
            //No more fields
            return;
        }
    }

    if (row == null) {
        row = rows.shift();
        if (row == null) {
            if (field != null || fields.length > 0) {
                throw new Error("No rows left, but bits");
            }
        }
    }

    var consumedBits = field.consume(row.bitsLeft);
    row.bitsLeft -= consumedBits;

    var description = (field.element == null ? field.description : "&#8230");

    if (field.element != null && field.rowspan == true) {
        field.numRowspan += 1;
        field.element.setAttribute('rowspan', field.numRowspan.toString());
    } else {
        var element = new Element('td');
        element.appendChild(new TextNode(description));
        element.setAttribute('colspan', consumedBits.toString());
        element.setAttribute('rowspan', field.numRowspan.toString());
        field.element = element;
        row.element.appendChild(field.element);
    }

    var nextRow = (row.bitsLeft ? row : null);
    var nextField = (field.bitsLeft ? field : null);

    this.fillRowsWithFields(nextRow, rows, nextField, fields);
}

packdown.createRows = function(totalNumBits, bitsWidth) {
    var numRows = Math.ceil(totalNumBits / bitsWidth);
    var rows = new Array();
    var r;
    for (r = 0; r < numRows; r++) {
        var bits = r * bitsWidth;
        var octets = bits / 8;
        var row = new Row(bitsWidth);
        row.element = new Element('tr');
        row.octetHeader = new Element('th');
        //row.octetHeader.appendChild(document.createTextNode("" + octets));
        row.octetHeader.appendChild(new TextNode("" + octets));
        row.element.appendChild(row.octetHeader);

        row.bitHeader = new Element('th');
        //row.bitHeader.appendChild(document.createTextNode("" + bits));
        row.bitHeader.appendChild(new TextNode("" + bits));
        row.element.appendChild(row.bitHeader);

        rows.push(row);
    }

    return rows;
}

packdown.createHeaders = function(bitsWidth) {
    var headers = new Array();

    /**
     * Create octet row header
     */
    var octetRow = new Element('tr');

    var offsets = new Element('th');
    var offsetText = new TextNode('Offsets');
    offsets.appendChild(offsetText);
    octetRow.appendChild(offsets);

    var octet = new Element('th');
    var octetText = new TextNode('Octet');
    octet.appendChild(octetText);
    octetRow.appendChild(octet);

    headers.push(octetRow);

    var numBytes = bitsWidth / 8;
    var o;
    for (o = 0; o < numBytes; o++) {
        var octet = new Element('th');
        octet.appendChild(new TextNode(o));
        octet.setAttribute('colspan', '8');
        octetRow.appendChild(octet);
    }


    /**
     * Create bit row header
     */

    var bitRow = new Element('tr');

    var octet = new Element('th');
    octet.appendChild(new TextNode('Octet'));
    bitRow.appendChild(octet);

    var bit = new Element('th');
    bit.appendChild(new TextNode('Bit'));
    bitRow.appendChild(bit);

    headers.push(bitRow);

    var b;
    for (b = 0; b < bitsWidth; b++) {
        bit = new Element('th');
        var bitText = "" + b;
        if (b < 10) {
            bitText = "\xa0" + bitText;
        }
        bit.appendChild(new TextNode(bitText));
        bitRow.appendChild(bit);
    }

    return headers;
}

packdown.createTable = function(bitsWidth) {
    var table = new Element('table');
    table.setAttribute('class', 'packdown');
    var headers = this.createHeaders(bitsWidth);
    for (let h of headers) {
        table.appendChild(h);
    }
    return table;
};

packdown.insertStyleSheet = function() {
    var style = new Element('style');
    style.type = 'text/css';
    style.appendChild(new TextNode(this.style));
    document.head.appendChild(style);
};

function render(token, inlineLexer) {
    //packdown.insertStyleSheet();
    var table = packdown.createTable(token.bitWidth);
    var rows = packdown.createRows(token.sumBits, token.bitWidth);

    if (inlineLexer != null) {
        for (let f of token.fields) {
            console.log(f.description);
            f.description = inlineLexer.output(f.description);
            console.log(f.description);
        }
    }

    packdown.fillRowsWithFields(null, rows.slice(0), null, token.fields);
    for (let r of rows) {
        table.appendChild(r.element);
    }

    var str = table.getHTML();
    return str;
}

function extractInfoFromPacketRegexCapture(cap, inlineLexer) {

    var fieldDefs = cap[2].trim().split(/[|\n]+/);
    var fields = [];
    var sumBits = 0;
    for (let fd of fieldDefs) {
        var f = Field.fromString(fd);
        if (f != null) {
            fields.push(f)
            sumBits += f.bits;
        }
    }

    return { fields: fields,
             sumBits: sumBits,
             bitWidth: parseInt(cap[1]) * 8,
             content: cap[2]
    };
}


/**
 * Marked integrations
 */
const markedType = 'packdown';
function markedLexer(cap) {
    console.log(cap);
    var fieldInfo = extractInfoFromPacketRegexCapture(cap);
    fieldInfo.type = markedType;

    return fieldInfo;
}

function markedRenderer(token, inlineLexer) {
    console.log(token);
    return render(token, inlineLexer);
}

const packdownMarkedExtension = {
    type: markedType,
    blockRegex: /^!Packet\s*(\d*)B?\n([\s\S]*?)Packet!/,
    blockLexer: markedLexer,
    blockRenderer: markedRenderer
};

/**
 * Packdown object and exports
 */
packdown.style = tableStyle;
packdown.markedExtension = packdownMarkedExtension;

if (typeof module !== 'undefined' && typeof exports === 'object') {
  module.exports = packdown;
} else if (typeof define === 'function' && define.amd) {
  define(function() { return packdown; });
} else {
  root.packdown = packdown;
}
})(this || (typeof window !== 'undefined' ? window : global));
