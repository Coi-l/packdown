#!/usr/bin/env python3

import re
import functools
import collections
from xml.etree import ElementTree as ET

pstring = """!Packet 4B
4b Version | 4b IHL | 6b DSCP | 2b ECN | 2B Total Length
2B Identification | 3b Flags | 13b Fragment Offset
8b Time To Live | 8b Protocol | 2B Header Checksum
4B Source Address
4B Destination Address
16B:S Options

"""
tcp_string = """
This is the TCP Packet header:

!Packet 4B
2B Source port | 2B Destination port
4B Sequence number
4B Acknowledgement number (if ACK set)
3b Data offset | 3b Reserved\n __0__ __0__ __0__
Packet!

"""
ip_string = """
This is the IP Packet header:

!Packet 4B
4b Version | 4b IHL | 6b DSCP | 2b ECN | 2B Total Length
2B Identification | 3b Flags | 13b Fragment Offset
8b Time To Live | 8b Protocol | 2B Header Checksum
4B __Source Address__
4B Destination Address
16B Options
Packet!


"""

pstring1 = """!Packet 6B
2B Version | 2B Header | 1B Test

"""

table_style = """
table.minimalistBlack {
  width: 100%;
  text-align: center;
  border-collapse: collapse;
}

table.minimalistBlack td, table.minimalistBlack th {
  border: 1px solid #000000;
}

"""
page = """
<html>
<head>
<style id="compiled-css" type="text/css">
{style}
</style>
</head>
<body>
<table class="minimalistBlack">
{table}
</table>
</body>
</html>
"""

packet = re.compile("!Packet\s*(\dB)?\n(.*)\n", re.MULTILINE | re.DOTALL)
unit_bit = "b"
unit_byte = "B"

class Row:
    def __init__(self):
        self.element = None
        self.field_elements = []
        self.octet_header = None
        self.bit_header = None
        self.bits_left = 0

class Field:
    def __init__(self, description, bits):
        self.desc = description
        self.bits = int(bits)
        self.bits_left = self.bits
        self.element = None
        self.rowspan = None

    def consume(self, bits_to_consume):
        if self.bits_left <= bits_to_consume:
            consumed = self.bits_left
            self.bits_left = 0
            return consumed, self.get_description()
        else:
            consumed = bits_to_consume
            self.bits_left -= consumed
            description = self.get_description()
            return consumed, description

    def get_description(self):
        if self.element != None :
            return "..."
        else:
            return self.desc

    @staticmethod
    def from_string(s):
        part = re.compile("(\d*)(b|B)?:?(S)?\s(.*)")
        s = s.strip()
        parts = part.match(s)
        size = int(parts.group(1))
        unit = parts.group(2)
        rowspan = parts.group(3)
        desc = parts.group(4)

        if rowspan != None:
            rowspan = True

        field = None
        if unit == unit_bit:
            field = Field(desc, bits=size)
        elif unit == unit_byte:
            field = Field(desc, bits=size * 8)

        if field and rowspan:
            field.rowspan = True

        return field

    def tostring(self):
        return "{size}{unit} {desc}".format(size=self.size, unit="b", desc=self.desc)

def construct_headers(num_bits_width, show_header=True, show_bytes=True, show_bits=True):
    headers = []

    if show_bytes:
        octet_row = ET.Element('tr')
        if show_header:
            offsets = ET.Element('th')
            offsets.text = 'Offsets'
            octet_row.append(offsets)

            octet = ET.Element('th')
            octet.text = 'Octet'
            octet_row.append(octet)

        num_bytes = num_bits_width // 8
        for o in range(num_bytes):
            octet = ET.Element('th', attrib={'colspan': '8'})
            octet.text = str(o)
            octet_row.append(octet)

        headers.append(octet_row)

    if show_bits:
        bit_row = ET.Element('tr')
        if show_header:
            octet = ET.Element('th')
            octet.text = 'Octet'
            bit_row.append(octet)
            bit = ET.Element('th')
            bit.text = 'Bit'
            bit_row.append(bit)

        bit_text = "{nbsp}{bit_index}"
        for b in range(num_bits_width):
            bit = ET.Element('th')
            nbsp = "&nbsp;" if b < 10 else ""
            bit.text = bit_text.format(bit_index=b, nbsp=nbsp)
            bit_row.append(bit)

        headers.append(bit_row)

    return headers

def fill_row_with_fields(row, rows, field, fields):
    if not field:
        try:
            field = fields.popleft()
        except IndexError as ie:
            return
    if not row:
        try:
            row = rows.popleft()
        except IndexError as ie:
            if field or len(fields) > 0:
                raise ValueError("No rows left, but bits")

    consumed_bits, desc = field.consume(row.bits_left)
    row.bits_left -= consumed_bits

    if field.element == None:
        field_element = ET.Element('td')
        field_element.text = desc
        field_element.set('colspan', str(consumed_bits))
        field_element.set('rowspan', str(1))
        row.field_elements.append(field_element)
        field.element = field_element

    elif field.rowspan:
        rs = field.element.get('rowspan')
        rs = int(rs)
        rs += 1
        field.element.set('rowspan', str(rs))

    else:
        field_element = ET.Element('td')
        field_element.text = desc
        field_element.set('colspan', str(consumed_bits))
        field_element.set('rowspan', str(1))
        row.field_elements.append(field_element)
        field.element = field_element

    next_row = row if row.bits_left > 0 else None
    next_field = field if field.bits_left > 0 else None

    fill_row_with_fields(next_row, rows, next_field, fields)

def create_rows(total_num_bits, num_bits_width):
    num_rows = total_num_bits // num_bits_width
    if total_num_bits % num_bits_width != 0:
        num_rows += 1

    rows = []
    for o in range(num_rows):
        r = Row()
        bits = o * num_bits_width
        octets = bits // 8
        r.bits_left = num_bits_width

        r.element = ET.Element('tr')

        r.octet_header = ET.Element('th')
        r.octet_header.text = str(octets)

        r.bit_header = ET.Element('th')
        r.bit_header.text = str(bits)

        rows.append(r)

    return rows

def build_table(num_bits_width):
    table = ET.Element('table', attrib={'class' : 'minimalistBlack'})
    headers = construct_headers(num_bits_width=num_bits_width)
    for h in headers:
        table.append(h)

    return table

def build_html_page(table):
    html = ET.Element('html')
    head = ET.Element('head')
    html.append(head)
    style = ET.Element('style')
    style.text = table_style
    head.append(style)
    body = ET.Element('body')
    body.append(table)
    html.append(body)

    return html

def compile_table(table, rows):
    for row in rows:
        row.element.append(row.octet_header)
        row.element.append(row.bit_header)
        for f in row.field_elements:
            row.element.append(f)
        table.append(row.element)

if __name__ == "__main__":
    res = packet.match(pstring)
    bytes_width = res.group(1)
    if bytes_width:
        bytes_width = int(bytes_width[0:-1])
    else:
        bytes_width = 4

    bits_width = bytes_width * 8

    packet_definition = res.group(2).strip()
    packet_content = re.split('\| |\n', packet_definition)
    fields = collections.deque()
    for field in packet_content:
        f = Field.from_string(field)
        fields.append(f)

    sum_bits  = functools.reduce(lambda x, y: x + y.bits, fields, 0)
    print("bytes_width: {0}, total bits: {1}".format(bytes_width, sum_bits))

    table = build_table(bits_width)
    rows = create_rows(sum_bits, bits_width)
    row_coll = collections.deque()
    row_coll.extend(rows)
    fill_row_with_fields(None, row_coll, None, fields)
    compile_table(table, rows)
    page = build_html_page(table)

    with open("output.html", "w") as f:
        s = ET.tostring(page, encoding='unicode', method='html')
        s = s.replace("&amp;", "&")
        f.write(s)
